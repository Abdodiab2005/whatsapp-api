// controllers/channelController.js
const whatsappService = require("../services/whatsapp.service");
const logger = require("../utils/logger");
const { successResponse, errorResponse } = require("../utils/responseHandler");

const getJid = async (req, res) => {
  const { link } = req.body;
  if (!link) {
    return errorResponse(
      res,
      "Invite link is required.",
      400,
      "Invite link is required."
    );
  }

  try {
    const inviteCode = link.split("/").pop();
    const jid = await whatsappService.getJidFromInvite(inviteCode);
    if (jid) {
      return successResponse(res, { jid }, 200, "JID found successfully.");
    } else {
      return errorResponse(
        res,
        "Could not find JID for the given link.",
        404,
        "Could not find JID for the given link."
      );
    }
  } catch (error) {
    logger.error(error);
    return errorResponse(
      res,
      "Failed to process the link.",
      500,
      "Failed to process the link."
    );
  }
};

const checkRole = async (req, res) => {
  const { link } = req.body;
  if (!link) {
    return errorResponse(
      res,
      "Invite link is required.",
      400,
      "Invite link is required."
    );
  }

  try {
    const inviteCode = link.split("/").pop();
    const jid = await whatsappService.getJidFromInvite(inviteCode);
    if (!jid) {
      return errorResponse(
        res,
        "Channel not found for this link.",
        404,
        "Channel not found for this link."
      );
    }
    const role = await whatsappService.getRoleInChannel(jid);
    return successResponse(res, { role }, 200, "Role found successfully.");
  } catch (error) {
    logger.error(error);
    return errorResponse(
      res,
      "Failed to check role.",
      500,
      "Failed to check role."
    );
  }
};

const sendMessage = async (req, res) => {
  const { link, message } = req.body;
  if (!link || !message) {
    return errorResponse(
      res,
      "Invite link and message are required.",
      400,
      "Invite link and message are required."
    );
  }

  try {
    const inviteCode = link.split("/").pop();
    const jid = await whatsappService.getJidFromInvite(inviteCode);
    if (!jid) {
      return errorResponse(
        res,
        "Channel not found for this link.",
        404,
        "Channel not found for this link."
      );
    }

    const role = await whatsappService.getRoleInChannel(jid);
    if (role !== "ADMIN" && role !== "OWNER") {
      return errorResponse(
        res,
        "Forbidden. You are not an admin in this channel.",
        403,
        "Forbidden. You are not an admin in this channel."
      );
    }

    await whatsappService.sendChannelMessage(jid, message);
    return successResponse(
      res,
      { message: "Message sent successfully." },
      200,
      "Message sent successfully."
    );
  } catch (error) {
    logger.error(error);
    return errorResponse(
      res,
      "Failed to send message.",
      500,
      "Failed to send message."
    );
  }
};

module.exports = { getJid, checkRole, sendMessage };
