import sys
import json
import os
import argparse
from typing import List, Dict, Any

# Ensure we can find the langextract package if it's installed in a venv
# This might be redundant if run from the venv python, but good for safety
try:
    import langextract as lx
except ImportError:
    print(json.dumps({"error": "langextract not installed. Please run 'pip install -r services/python/requirements.txt'"}), file=sys.stderr)
    sys.exit(1)

from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def main():
    parser = argparse.ArgumentParser(description='LangExtract Wrapper')
    parser.add_argument('--file', required=True, help='Path to the file to process')
    parser.add_argument('--prompt', required=True, help='Extraction prompt description')
    parser.add_argument('--model', default='gemini-2.0-flash', help='Model ID to use')
    parser.add_argument('--schema', help='Optional JSON schema for extraction (not fully supported in CLI yet, using prompt mainly)')
    
    args = parser.parse_args()
    
    # Validate API Key
    if not os.getenv('LANGEXTRACT_API_KEY') and not os.getenv('GOOGLE_API_KEY'):
         # Fallback: check if passed via specific env var or if we need to map it
         # langextract looks for LANGEXTRACT_API_KEY or GOOGLE_API_KEY for gemini
         pass

    try:
        # Basic setup
        # For this bridge, we will construct a simple extraction task
        # We assume the user might want a generic extraction or specific one
        # For now, we accept a text prompt.
        
        # We don't have complex example objects passed via CLI easily yet.
        # We will use a generic "extract what is asked" approach or 
        # allow passing a JSON file with examples if needed in the future.
        
        # Simple extraction without complex examples for now, relying on the prompt
        
        # Add a dummy example to satisfy the library requirements
        # LangExtract requires at least one example to guide the model.
        examples = [
            lx.data.ExampleData(
                text="Alice lives in Wonderland.",
                extractions=[
                    lx.data.Extraction(
                        extraction_class="entity",
                        extraction_text="Alice",
                        attributes={"type": "person", "context": "protagonist"}
                    )
                ]
            )
        ]
        
        result = lx.extract(
            text_or_documents=args.file,
            prompt_description=args.prompt,
            model_id=args.model,
            examples=examples 
        )
        
        # Serialize result to JSON
        # derived from lx.data.ExtractionResult
        
        output = {
            "extractions": [
                {
                    "class": e.extraction_class,
                    "text": e.extraction_text,
                    "attributes": e.attributes,
                    "citations": [
                        {
                            "start": c.start,
                            "end": c.end,
                            "text": c.text
                        } for c in e.citations
                    ] if hasattr(e, 'citations') else []
                }
                for e in result.extractions
            ],
            "model": result.model_id,
            "usage": result.usage_metadata
        }
        
        print(json.dumps(output, indent=2))
        
    except Exception as e:
        error_msg = {"error": str(e), "type": type(e).__name__}
        print(json.dumps(error_msg), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
