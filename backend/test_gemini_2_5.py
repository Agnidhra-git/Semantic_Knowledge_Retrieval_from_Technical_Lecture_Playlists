"""
Test script for newer Gemini models (2.5 Flash and latest aliases).
"""
import google.generativeai as genai
from config import get_settings

settings = get_settings()
genai.configure(api_key=settings.gemini_api_key)

print("=" * 80)
print("TESTING CURRENT GEMINI MODELS (2.5 and Latest)")
print("=" * 80)

# Test the models that actually exist and should work
test_models = [
    "gemini-2.5-flash",           # Stable Gemini 2.5
    "gemini-flash-latest",         # Latest Flash (alias)
    "models/gemini-2.5-flash",    # With models/ prefix
    "models/gemini-flash-latest",  # With models/ prefix
    "gemini-2.5-pro",              # Pro version
]

test_prompt = "What is 2+2? Answer in one word."

for model_name in test_models:
    print(f"\n{'='*60}")
    print(f"Testing: {model_name}")
    print('='*60)
    try:
        model = genai.GenerativeModel(model_name)
        response = model.generate_content(test_prompt)
        print(f"✅ SUCCESS!")
        print(f"   Response: {response.text.strip()}")
        
        # Check rate limit info
        if hasattr(response, 'usage_metadata'):
            print(f"   Usage: {response.usage_metadata}")
        
        # Check prompt feedback
        if hasattr(response, 'prompt_feedback'):
            print(f"   Feedback: {response.prompt_feedback}")
            
    except Exception as e:
        error_msg = str(e)
        print(f"❌ FAILED")
        print(f"   Error: {error_msg[:200]}")

print("\n" + "=" * 80)
print("RECOMMENDED MODEL FOR YOUR CODEBASE")
print("=" * 80)
print("Based on tests, use one of the ✅ SUCCESS models above.")
print("Best choice: 'gemini-2.5-flash' (stable, faster than 2.0)")
print("Alternative: 'gemini-flash-latest' (auto-updates to latest)")
print("=" * 80)
