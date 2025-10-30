# Moodle Integration Troubleshooting Guide

## Quick Diagnosis

### Error: "Invalid response from NLP service"

This error means the PHP code couldn't parse the response from the Node.js API. Here are the most common causes:

## ✅ Step-by-Step Fix

### 1. Verify Node.js Server is Running

**Check if server is running:**
```bash
# Windows PowerShell
Invoke-RestMethod -Uri "http://localhost:3000/health" -Method Get

# Should return:
# status  : healthy
# service : NLP Question Generator
# version : 1.0.0
```

**If server is NOT running, start it:**
```bash
npm start
```

**Keep it running in the background** - don't close the terminal!

### 2. Test the API Directly

```powershell
$body = @{
    text = "Test text about education"
    num_questions = 2
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/generate" -Method Post -Body $body -ContentType "application/json" | ConvertTo-Json -Depth 10
```

**Expected output:**
```json
{
  "questions": [
    {
      "questiontext": "...",
      "optiona": "...",
      "optionb": "...",
      "optionc": "...",
      "optiond": "...",
      "correctanswer": "A",
      "difficulty": "medium"
    }
  ]
}
```

### 3. Check Moodle Configuration

In your Moodle admin settings (`Site administration > Plugins > Activity modules > ClassEngage`):

**NLP Endpoint:** 
```
http://localhost:3000/generate
```

**Important Notes:**
- Use `http://` not `https://`
- Include `/generate` at the end
- Don't add trailing slash

### 4. Enable Debug Mode in Moodle

1. Go to `Site administration > Development > Debugging`
2. Set **Debug messages** to `DEVELOPER`
3. Check **Display debug messages**
4. Click **Save changes**

This will show you detailed error messages!

### 5. Use Enhanced Debug Version

Replace your `call_nlp_service` method in `classes/nlp_generator.php` with the one from `nlp_generator_debug.php`.

This will log detailed information about:
- The request being sent
- The response received
- JSON parsing errors
- Validation errors

Check your Moodle logs after running it!

## Common Issues & Solutions

### Issue 1: "Connection refused" or "Failed to connect"

**Problem:** Moodle can't reach the Node.js server

**Solutions:**
- Make sure Node.js server is running (`npm start`)
- Check if Moodle is on the same machine as Node.js
- If Moodle is on a different server, use the IP address instead of `localhost`
- Check firewall settings

### Issue 2: "Invalid JSON response"

**Problem:** The API returned something that's not valid JSON

**Solutions:**
1. Check if you're using the correct model name in `index.js`:
   ```javascript
   const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
   ```
   
2. Test the API directly (see step 2 above)

3. Check Node.js server logs for errors

### Issue 3: "Rate limit exceeded"

**Problem:** You've hit Gemini API's free tier limit (60 requests/minute)

**Solutions:**
- Wait a minute and try again
- Reduce the number of questions per request
- Implement caching in Moodle
- Consider upgrading to paid tier

### Issue 4: "Missing questions array"

**Problem:** Response doesn't have the `questions` key

**Solutions:**
1. The Gemini API might have returned an error. Check the response format:
   ```php
   debugging("Raw response: $response", DEBUG_DEVELOPER);
   ```

2. Make sure your `.env` file has the correct API key

3. Test with simpler text (shorter content)

### Issue 5: Moodle and Node.js on Different Machines

If your Moodle server is on a different machine than your Node.js server:

1. **Find your Node.js server's IP address:**
   ```powershell
   # Windows
   ipconfig
   # Look for IPv4 Address
   ```

2. **Update Moodle endpoint:**
   ```
   http://YOUR_SERVER_IP:3000/generate
   ```

3. **Make sure port 3000 is open in firewall:**
   ```powershell
   # Windows - run as Administrator
   New-NetFirewallRule -DisplayName "Node.js NLP API" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
   ```

### Issue 6: HTTPS/SSL Issues

If your Moodle requires HTTPS:

1. **Option A:** Set up nginx reverse proxy with SSL
2. **Option B:** Deploy to a cloud service with HTTPS (Heroku, Railway, etc.)
3. **Option C:** Temporarily allow HTTP for localhost in Moodle config

## Testing Without Moodle

Run the standalone test:

```bash
php test-moodle-connection.php
```

This will tell you exactly where the problem is!

## Verify Your Setup

**Checklist:**
- [ ] Node.js server is running (`npm start`)
- [ ] `.env` file exists with valid `GEMINI_API_KEY`
- [ ] Health endpoint works: `http://localhost:3000/health`
- [ ] Generate endpoint works (test with PowerShell/curl)
- [ ] Moodle NLP endpoint setting is correct
- [ ] Moodle debugging is enabled
- [ ] No firewall blocking port 3000

## Production Deployment Tips

For production use:

### 1. Keep Server Running Permanently

**Option A: PM2 (recommended)**
```bash
npm install -g pm2
pm2 start index.js --name nlp-api
pm2 startup  # Configure to start on boot
pm2 save
```

**Option B: Windows Service**
- Use NSSM (Non-Sucking Service Manager)
- Or Task Scheduler

**Option C: Docker**
```bash
docker-compose up -d
```

### 2. Use a Process Monitor

Make sure the Node.js service restarts if it crashes.

### 3. Set Up Logging

Redirect output to log files:
```bash
pm2 logs nlp-api
```

### 4. Monitor API Usage

Keep track of Gemini API quota usage to avoid hitting limits.

### 5. Add Caching

Cache generated questions in Moodle to reduce API calls.

## Getting More Help

If you're still having issues:

1. **Check Node.js logs:**
   - Look at the terminal where you ran `npm start`
   - Look for error messages

2. **Check Moodle logs:**
   - `Site administration > Reports > Logs`
   - Look for debugging messages

3. **Test with curl:**
   ```bash
   curl -X POST http://localhost:3000/generate \
     -H "Content-Type: application/json" \
     -d '{"text":"test","num_questions":1}'
   ```

4. **Verify Gemini API key:**
   - Go to https://makersuite.google.com/app/apikey
   - Make sure your key is active
   - Try regenerating it if needed

## Success Indicators

You'll know it's working when:
- ✅ Node.js server shows: "API Key configured: Yes"
- ✅ Health check returns "healthy"
- ✅ Test generate request returns questions
- ✅ Moodle shows "X questions generated successfully"
- ✅ No error messages in Moodle debugging output

## Example Working Configuration

**Node.js Server (.env):**
```
GEMINI_API_KEY=AIzaSyC4MSthrBsni10i-8tUH8h5t0YzS_b2qAE
PORT=3000
```

**Moodle Settings:**
```
NLP Endpoint: http://localhost:3000/generate
Default Questions: 10
```

**Server Status:**
```
$ npm start
> nlp-question-generator@1.0.0 start
> node index.js

NLP Question Generator API running on port 3000
API Key configured: Yes

Endpoints:
  GET  http://localhost:3000/
  GET  http://localhost:3000/health
  POST http://localhost:3000/generate
```

That's it! Your integration should now be working. 🎉


