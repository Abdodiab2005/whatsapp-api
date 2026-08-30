const fs = require("node:fs/promises");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const {
  extractImageThumb,
  generateThumbnail,
  getAudioDuration,
  getAudioWaveform,
} = require("@whiskeysockets/baileys");
const logger = require("./logger");

const execFileAsync = promisify(execFile);

/**
 * Width of the inline preview WhatsApp shows before the full media downloads.
 * Baileys defaults to 32px, which is too coarse to read; 72px still encodes to
 * roughly 2 KB of JPEG and stays far below the message size budget.
 */
const THUMBNAIL_WIDTH = 72;
const PROBE_TIMEOUT_MS = 15_000;

/**
 * `audio-type` and `audio-decode` both sniff the format through
 * `new Uint8Array(buf.buffer)`, which ignores `byteOffset`. A Buffer that Node
 * carved out of its shared allocation pool therefore reads as garbage and the
 * format detection fails at random. Re-anchoring the bytes on their own
 * ArrayBuffer makes waveform generation deterministic.
 */
function toZeroOffsetBuffer(buffer) {
  if (
    Buffer.isBuffer(buffer) &&
    buffer.byteOffset === 0 &&
    buffer.byteLength === buffer.buffer.byteLength
  ) {
    return buffer;
  }
  return Buffer.from(new Uint8Array(buffer).buffer);
}

function positiveInteger(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : undefined;
}

async function imageMetadata(filePath) {
  const { buffer, original } = await extractImageThumb(
    filePath,
    THUMBNAIL_WIDTH,
  );
  return {
    jpegThumbnail: buffer,
    width: positiveInteger(original?.width),
    height: positiveInteger(original?.height),
  };
}

/**
 * ffprobe is the only dependable source for video dimensions and duration.
 * Baileys never fills either field, so a video without this shows up with no
 * size and a 0:00 runtime.
 */
async function probeVideo(filePath) {
  const { stdout } = await execFileAsync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height:format=duration",
      "-of",
      "json",
      filePath,
    ],
    { timeout: PROBE_TIMEOUT_MS, maxBuffer: 1024 * 1024 },
  );

  const parsed = JSON.parse(stdout);
  const stream = parsed.streams?.[0] ?? {};
  return {
    width: positiveInteger(stream.width),
    height: positiveInteger(stream.height),
    seconds: positiveInteger(parsed.format?.duration),
  };
}

async function videoMetadata(filePath) {
  const [dimensions, thumbnail] = await Promise.all([
    probeVideo(filePath).catch((error) => {
      logger.debug({ err: error }, "ffprobe video metadata unavailable");
      return {};
    }),
    generateThumbnail(filePath, "video", {}).catch((error) => {
      logger.debug({ err: error }, "Video thumbnail generation failed");
      return {};
    }),
  ]);

  return {
    ...dimensions,
    ...(thumbnail?.thumbnail
      ? { jpegThumbnail: Buffer.from(thumbnail.thumbnail, "base64") }
      : {}),
  };
}

async function audioMetadata(filePath, { ptt }) {
  const metadata = {};

  try {
    metadata.seconds = positiveInteger(await getAudioDuration(filePath));
  } catch (error) {
    logger.debug({ err: error }, "Audio duration unavailable");
  }

  if (!ptt) return metadata;

  try {
    const waveform = await getAudioWaveform(
      toZeroOffsetBuffer(await fs.readFile(filePath)),
    );
    if (waveform?.length) metadata.waveform = waveform;
  } catch (error) {
    logger.debug({ err: error }, "Audio waveform generation failed");
  }

  return metadata;
}

/**
 * Best-effort preview metadata for one uploaded file. Every field is optional
 * and any failure is logged and dropped: media must still send when the
 * machine has no ffmpeg, no image library, or an exotic codec.
 */
async function describeMediaMetadata(filePath, mediaType, { ptt } = {}) {
  try {
    if (mediaType === "image") return await imageMetadata(filePath);
    if (mediaType === "video") return await videoMetadata(filePath);
    if (mediaType === "audio") return await audioMetadata(filePath, { ptt });
  } catch (error) {
    logger.debug(
      { err: error, mediaType },
      "Media preview metadata unavailable",
    );
  }
  return {};
}

/**
 * Fills preview fields on a Baileys media content object. Baileys computes some
 * of these for private chats but never for newsletters, and it never computes
 * video dimensions or duration at all, so channel media otherwise arrives with
 * no thumbnail, no size, and no runtime. Values already present are kept.
 */
async function attachMediaMetadata(content, file, mediaType) {
  if (!file?.path || !mediaType) return content;

  const metadata = await describeMediaMetadata(file.path, mediaType, {
    ptt: content.ptt === true,
  });

  for (const [key, value] of Object.entries(metadata)) {
    if (value !== undefined && content[key] === undefined) {
      content[key] = value;
    }
  }
  return content;
}

module.exports = {
  THUMBNAIL_WIDTH,
  attachMediaMetadata,
  describeMediaMetadata,
  toZeroOffsetBuffer,
};
