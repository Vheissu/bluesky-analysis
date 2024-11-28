# Bluesky Stream Application

A real-time Bluesky streaming application with a Node.js backend and Aurelia 2 frontend. This application allows you to track your followers and analyze the best time to post, as well as view your follower count and growth over time (including follow and unfollow events).

## Prerequisites

- Node.js latest LTS
- npm latest
- A Bluesky account and App Password

## Project Structure 

bsky-stream-root/
├── backend/ # Node.js backend service
├── bsky-stream/ # Aurelia 2 frontend application
└── package.json # Root workspace configuration

## Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd bsky-stream-root
```

2. Create a `.env` file in the `backend` directory with your Bluesky credentials:
```env
BLUESKY_HANDLE=your.handle
BLUESKY_PASSWORD=your-app-password
TIMEZONE_OFFSET=your-timezone-offset
FOLLOWER_CAP=1000
```

### Environment Variables Explained

- `BLUESKY_HANDLE`: Your Bluesky handle (e.g., `username.bsky.social`)
- `BLUESKY_PASSWORD`: Your Bluesky App Password (not your account password)
  - Generate this from Bluesky Settings → App Passwords
- `TIMEZONE_OFFSET`: Your timezone offset in hours (e.g., `10` for AEST)
- `FOLLOWER_CAP`: Maximum number of followers to track for the analysis feature (default: 1000)

## Installation

Install all dependencies for both frontend and backend:
```bash
npm install:all
```

## Running the Application

Start both the backend and frontend services:
```bash
npm start
```


Or run them individually:

- Frontend only: `npm run start:frontend`
- Backend only: `npm run start:backend`

The application will be available at:
- Frontend: `http://localhost:9000`
- Backend: `http://localhost:3000`

## Development

### Backend
The backend service handles:
- Bluesky authentication
- WebSocket connections
- Follower tracking
- Event streaming

### Frontend
The frontend application provides:
- Real-time follower updates
- User interface for stream visualization
- Analsysis to determine the best time to post

## Troubleshooting

1. **Connection Issues**
   - Verify your Bluesky credentials in the `.env` file
   - Ensure your App Password is correct and active
   - Check if you've exceeded Bluesky's API rate limits

2. **Installation Problems**
   - Clear npm cache: `npm cache clean --force`
   - Delete `node_modules` and run `npm run install:all` again

3. **Runtime Errors**
   - Check the console for error messages
   - Verify your timezone offset is correct
   - Ensure your follower cap is reasonable for your account

## Security Notes

- Never commit your `.env` file to version control
- Use App Passwords instead of your main account password
- Regularly rotate your App Passwords for security

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request