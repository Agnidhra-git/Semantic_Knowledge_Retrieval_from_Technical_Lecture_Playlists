"""
Test script to discover available Gemini models and test API calls.
"""
import os
import google.generativeai as genai
from config import get_settings

settings = get_settings()
genai.configure(api_key=settings.gemini_api_key)

print("=" * 80)
print("LISTING ALL AVAILABLE GEMINI MODELS")
print("=" * 80)

# List all available models
for model in genai.list_models():
    print(f"\nModel: {model.name}")
    print(f"  Display Name: {model.display_name}")
    print(f"  Description: {model.description[:100] if model.description else 'N/A'}...")
    if hasattr(model, 'supported_generation_methods'):
        print(f"  Supported methods: {model.supported_generation_methods}")

print("\n" + "=" * 80)
print("TESTING GEMINI 2.0 FLASH MODELS")
print("=" * 80)

# Test possible Gemini 2 Flash model names
test_models = [
    "gemini-2.0-flash",
    "gemini-2.0-flash-exp",
    "models/gemini-2.0-flash",
    "models/gemini-2.0-flash-exp",
    "gemini-2.0-flash-latest",
    "gemini-flash-2.0",
]

test_prompt = "Say 'Hello' in exactly one word."

for model_name in test_models:
    print(f"\n--- Testing: {model_name} ---")
    try:
        model = genai.GenerativeModel(model_name)
        response = model.generate_content(test_prompt)
        print(f"✅ SUCCESS: {response.text.strip()}")
        print(f"   Rate limit info: {response.usage_metadata if hasattr(response, 'usage_metadata') else 'N/A'}")
    except Exception as e:
        print(f"❌ FAILED: {str(e)[:150]}")

print("\n" + "=" * 80)
print("TESTING GEMINI 1.5 FLASH MODELS (FALLBACK)")
print("=" * 80)

fallback_models = [
    "gemini-1.5-flash",
    "gemini-1.5-flash-latest",
    "gemini-1.5-flash-002",
]

for model_name in fallback_models:
    print(f"\n--- Testing: {model_name} ---")
    try:
        model = genai.GenerativeModel(model_name)
        response = model.generate_content(test_prompt)
        print(f"✅ SUCCESS: {response.text.strip()}")
    except Exception as e:
        print(f"❌ FAILED: {str(e)[:150]}")

print("\n" + "=" * 80)
print("RECOMMENDATION")
print("=" * 80)
print("Use the first ✅ SUCCESS model from the Gemini 2.0 Flash tests above.")
print("If none work, use the first ✅ SUCCESS model from Gemini 1.5 Flash.")
print("=" * 80)
