curl -fsSL https://ollama.com/install.sh | sh

ollama --version

systemctl status ollama

sudo systemctl start ollama

sudo systemctl enable ollama

curl http://localhost:11434/api/tags

output 
{
  "models": []
}


Pull model:

super fast:
ollama pull qwen2.5:0.5b

balanced:
ollama pull phi3

quality
ollama pull llama3


check
ollama list

test:
ollame run qwen2.5:0.5b "Hello, how are you?"

add to env:
LOCAL_API_URL=http://localhost:11434
LOCAL_MODEL=qwen2.5:0.5b

use ai hub like hugging face to pull models

If the model not available in ollama library, you can download the .gguf file from Hugging Face and use a Modelfile to run it.
