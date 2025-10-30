# Quick Setup Guide

This guide will help you get the NLP Question Generator API up and running in minutes.

## Step 1: Get Your Free Gemini API Key

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Sign in with your Google account
3. Click **"Create API Key"** or **"Get API Key"**
4. Copy the API key (it starts with something like `AIza...`)

## Step 2: Install Dependencies

Open a terminal in this directory and run:

```bash
npm install
```

This will install:
- `@google/generative-ai` - Google's Gemini API client
- `express` - Web framework
- `dotenv` - Environment variable management

## Step 3: Configure Your API Key

### Option A: Create .env file (Recommended)

1. Copy the example file:
```bash
# On Windows (PowerShell)
Copy-Item env.example .env

# On Mac/Linux
cp env.example .env
```

2. Edit `.env` and replace `your_api_key_here` with your actual API key:
```
GEMINI_API_KEY=AIzaSyC...your_actual_key_here
PORT=3000
```

### Option B: Set Environment Variable Temporarily

**Windows (PowerShell):**
```powershell
$env:GEMINI_API_KEY="AIzaSyC...your_actual_key_here"
node index.js
```

**Mac/Linux:**
```bash
export GEMINI_API_KEY="AIzaSyC...your_actual_key_here"
node index.js
```

## Step 4: Start the Server

```bash
npm start
```

You should see:
```
NLP Question Generator API running on port 3000
API Key configured: Yes

Endpoints:
  GET  http://localhost:3000/
  GET  http://localhost:3000/health
  POST http://localhost:3000/generate
```

## Step 5: Test the API

### Option 1: Using the Test Script (Node.js)

```bash
node test-example.js
```

### Option 2: Using PowerShell (Windows)

```powershell
.\test-api.ps1
```

### Option 3: Using Bash (Mac/Linux)

```bash
chmod +x test-api.sh
./test-api.sh
```

### Option 4: Using Browser

Open your browser and go to: `http://localhost:3000`

You'll see the API documentation with all available endpoints.

### Option 5: Using curl

```bash
curl -X POST http://localhost:3000/generate \
  -H "Content-Type: application/json" \
  -d "{\"text\":\"The solar system contains eight planets orbiting the Sun.\",\"num_questions\":2}"
```

## Step 6: Integrate with Your Application

### For Moodle Integration:

In your Moodle admin settings:
- **NLP Endpoint:** `http://localhost:3000/generate`
- **API Key:** (leave empty or use Bearer token if you add authentication)

The PHP code from your `nlp_generator.php` should work without modifications!

### For Other Applications:

Make a POST request to `/generate` with this body:

```json
{
  "text": "Your educational content here...",
  "num_questions": 10
}
```

The response will be:

```json
{
  "questions": [
    {
      "questiontext": "What is...?",
      "optiona": "Option A",
      "optionb": "Option B",
      "optionc": "Option C",
      "optiond": "Option D",
      "correctanswer": "A",
      "difficulty": "medium"
    }
  ]
}
```

## Troubleshooting

### "API Key configured: No"

Your API key is not set. Make sure:
1. You created the `.env` file
2. The API key is correctly formatted
3. There are no extra spaces or quotes

### "Invalid API key" error

1. Check your API key is correct
2. Make sure it starts with `AIza`
3. Regenerate the key if needed

### Port already in use

Change the port in `.env`:
```
PORT=3001
```

### Cannot connect to API

1. Make sure the server is running
2. Check firewall settings
3. Try `http://localhost:3000/health` first

## Production Deployment

For production use:

1. **Use a process manager:** PM2, systemd, or Docker
2. **Add authentication:** Implement API key validation
3. **Use HTTPS:** Set up a reverse proxy (nginx/Apache)
4. **Add rate limiting:** Prevent abuse
5. **Monitor usage:** Track API calls and errors
6. **Environment:** Set `NODE_ENV=production`

Example with PM2:
```bash
npm install -g pm2
pm2 start index.js --name nlp-api
pm2 save
pm2 startup
```

## API Rate Limits (Free Tier)

Gemini API free tier limits:
- **60 requests per minute**
- **1,500 requests per day**

If you hit the rate limit, implement:
- Request queuing
- Exponential backoff
- Caching of results

## Next Steps

- ✅ Server is running
- ✅ API key configured
- ✅ Test successful
- 📚 Read the [full README](README.md) for advanced usage
- 🔧 Customize the prompt in `index.js` for your needs
- 🚀 Deploy to production server

## Need Help?

Check the [README.md](README.md) for more detailed information and examples.

