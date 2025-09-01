import asyncio
import httpx
from backend.api.api_server import uuid_file_mapping

async def test_audio_proxy():
    # Test with the problematic UUID
    test_uuid = "04633e95-890e-4c3c-a4e0-33e2670026c8"
    
    if test_uuid in uuid_file_mapping:
        url = uuid_file_mapping[test_uuid]
        print(f"Testing URL: {url}")
        
        if url.startswith("http"):
            print("This is a URL, testing proxy functionality...")
            try:
                async with httpx.AsyncClient() as client:
                    response = await client.get(url)
                    print(f"Response status: {response.status_code}")
                    print(f"Content length: {len(response.content) if response.status_code == 200 else 'N/A'} bytes")
                    if response.status_code == 200:
                        print("✅ Successfully fetched audio content!")
                        # Check if it's actually an audio file by looking at the first few bytes
                        if response.content.startswith(b'fLaC') or response.content.startswith(b'ID3'):
                            print("✅ Content appears to be a valid audio file!")
                        else:
                            print("⚠️  Content doesn't appear to be a valid audio file")
                    else:
                        print(f"❌ Failed to fetch content: {response.status_code}")
            except Exception as e:
                print(f"❌ Error fetching URL: {str(e)}")
        else:
            print("This is a local file path")
    else:
        print("UUID not found in mapping")

if __name__ == "__main__":
    asyncio.run(test_audio_proxy())