# GEMINI.md

## Project Overview

This project is a Node.js Express server that provides an API for interacting with a WhatsApp account. It utilizes the `@whiskeysockets/baileys` library to connect to WhatsApp and allows users to send messages to channels and private chats programmatically. The server uses a modular structure, with separate routes for channel and chat operations. It also includes features like persistent session storage using SQLite, API key authentication, and error logging.

### Key Technologies

*   **Backend:** Node.js, Express
*   **WhatsApp Integration:** `@whiskeysockets/baileys`
*   **Database:** SQLite for session storage
*   **Dependencies:**
    *   `dotenv`: For managing environment variables.
    *   `express`: Web framework for Node.js.
    *   `libphonenumber-js`: For validating phone numbers.
    *   `morgan`: HTTP request logger middleware.
    *   `pino`: For logging.
    *   `qrcode-terminal`: To display QR codes in the terminal.
    *   `sqlite3`: SQLite client for Node.js.

## Building and Running

### 1. Installation

To install the project dependencies, run the following command:

```bash
npm install
```

### 2. Running the Application

To start the server, use the following command:

```bash
node index.js
```

Upon the first run, a QR code will be displayed in the terminal. You need to scan this QR code with your WhatsApp mobile app to link the server to your WhatsApp account.

### 3. API Key

The application requires an API key for authentication. The key is automatically generated on the first run and stored in the `.env` file. You need to include this API key in the `Authorization` header of your API requests.

## Development Conventions

*   **Modular Structure:** The code is organized into modules for controllers, routes, services, and utils, promoting separation of concerns and maintainability.
*   **API Key Authentication:** All API endpoints are protected with an API key authentication middleware.
*   **Error Handling:** The application uses `pino` for logging, with a focus on logging errors to a file.
*   **Session Management:** The server uses SQLite for persistent session storage, which is more stable than file-based authentication.
*   **Code Style:** The code follows the CommonJS module system (`require`/`module.exports`).
