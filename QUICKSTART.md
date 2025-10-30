# ⚡ Quick Start (5 Minutes)

Get up and running in 5 simple steps:

## 1. Get API Key
Visit [Google AI Studio](https://makersuite.google.com/app/apikey) → Click "Create API Key" → Copy it

## 2. Install
```bash
npm install
```

## 3. Configure
Create `.env` file:
```bash
GEMINI_API_KEY=paste_your_key_here
PORT=3000
```

## 4. Run
```bash
npm start
```

## 5. Test
```bash
node test-example.js
```

## ✅ Done!

Your API is now running at `http://localhost:3000`

**Try it:**
```bash
curl -X POST http://localhost:3000/generate \
  -H "Content-Type: application/json" \
  -d '{"text":"AI is fascinating","num_questions":2}'
```

**For Moodle:**
Set NLP endpoint to: `http://localhost:3000/generate`

---

📚 **Need more details?** Read [SETUP.md](SETUP.md) or [README.md](README.md)

