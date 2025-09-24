# WhatsApp API Server

This is a Node.js Express server that acts as an API for a WhatsApp account using the Baileys library. It allows you to send messages to channels and private chats programmatically.

## Features

- **Modular Structure:** Clean, organized, and easy to maintain.
- **Persistent Session:** Uses SQLite for session storage, more stable than file-based auth.
- **Channel Operations:**
  - Get a channel's JID from an invite link.
  - Check your role (Admin/Owner/Subscriber) in a channel.
  - Send messages to channels (only if you are an admin).
- **Private Chat Operations:**
  - Send messages to any private number.
  - Validates phone number format using `libphonenumber-js`.
  - Checks if the number is on WhatsApp before sending.
- **Error Logging:** Logs only errors to a file (`logs/error.log`) using Pino.
- **API Key Authentication:** All API endpoints are protected with an API key authentication middleware.

## Setup

1. **Clone the repository.**
2. **Install dependencies:**
   ```bash
   npm install
   ```
3. **Run the application:**
   ```bash
   node index.js
   ```
4. **Connect to WhatsApp:** The first time you run it, a QR code will appear in your terminal. Scan it with your WhatsApp mobile app (Linked Devices).
5. **API Key:** The application requires an API key for authentication. The key is automatically generated on the first run and stored in the `.env` file. You need to include this API key in the `x-api-key` header of your API requests.

## API Endpoints

### Authentication

All API endpoints require an API key for authentication. The key is automatically generated on the first run and stored in the `.env` file. You need to include this API key in the `x-api-key` header of your API requests.

**Header:**

```
x-api-key: YOUR_API_KEY
```

### Channel Routes

Base URL: `/channel`

- **`POST /channel/send`**: Sends a message to a channel.

  - **Body (JSON):**
    ```json
    {
      "link": "https://whatsapp.com/channel/...",
      "message": "Hello from my API!"
    }
    ```
  - **Responses:**
    - `200 OK`: Message sent successfully.
    - `400 Bad Request`: `link` or `message` is missing.
    - `403 Forbidden`: You are not an admin in the channel.
    - `404 Not Found`: Channel not found for the given link.

- **`POST /channel/check-role`**: Checks your role in a channel.

  - **Body (JSON):**
    ```json
    {
      "link": "https://whatsapp.com/channel/..."
    }
    ```
  - **Response (`200 OK`):**
    ```json
    {
      "role": "ADMIN"
    }
    ```

- **`POST /channel/get-jid`**: Gets the JID of a channel.

  - **Body (JSON):**
    ```json
    {
      "link": "https://whatsapp.com/channel/..."
    }
    ```
  - **Response (`200 OK`):**
    ```json
    {
      "jid": "1234567890@newsletter"
    }
    ```

### Private Chat Routes

- **`POST /send`**: Sends a message to a private number.
  - **Body (JSON):**
    ```json
    {
      "number": "+201001234567",
      "message": "Hello there!"
    }
    ```
  - **Responses:**
    - `200 OK`: Message sent successfully.
    - `400 Bad Request`: Invalid number format or missing parameters.
    - `404 Not Found`: The number is not on WhatsApp.

## Project Structure

The project follows a modular structure to promote separation of concerns and maintainability.

- `src/controllers`: Contains the logic for handling API requests.
- `src/routes`: Defines the API routes and maps them to the corresponding controllers.
- `src/services`: Contains the business logic of the application.
- `src/utils`: Contains utility functions and helpers.
- `src/middleware`: Contains middleware functions, such as authentication.
- `index.js`: The entry point of the application.

## Key Technologies

- **Backend:** Node.js, Express
- **WhatsApp Integration:** `@whiskeysockets/baileys`
- **Database:** SQLite for session storage
- **Dependencies:**
  - `dotenv`: For managing environment variables.
  - `express`: Web framework for Node.js.
  - `libphonenumber-js`: For validating phone numbers.
  - `morgan`: HTTP request logger middleware.
  - `pino`: For logging.
  - `qrcode-terminal`: To display QR codes in the terminal.
  - `sqlite3`: SQLite client for Node.js.
