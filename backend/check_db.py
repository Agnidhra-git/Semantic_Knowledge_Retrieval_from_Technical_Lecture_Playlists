from db.supabase_client import get_supabase

def check_database():
    sb = get_supabase()
    
    print("=" * 60)
    print("DATABASE DIAGNOSTIC REPORT")
    print("=" * 60)
    
    # Check playlists
    print("\n=== PLAYLISTS ===")
    playlists = sb.table('playlists').select('id, title, subject, video_count, processed').execute()
    print(f"Total playlists: {len(playlists.data)}")
    for p in playlists.data:
        print(f"  - {p['title']}")
        print(f"    Subject: {p['subject']}")
        print(f"    Videos: {p['video_count']}, Processed: {p['processed']}")
    
    # Check videos
    print("\n=== VIDEOS ===")
    videos = sb.table('videos').select('id, title, processed').execute()
    print(f"Total videos: {len(videos.data)}")
    processed_count = sum(1 for v in videos.data if v['processed'])
    print(f"Processed videos: {processed_count}/{len(videos.data)}")
    
    # Check transcript chunks
    print("\n=== TRANSCRIPT CHUNKS ===")
    chunks = sb.table('transcript_chunks').select('id', count='exact').execute()
    print(f"Total chunks: {chunks.count}")
    
    # Check glossary
    print("\n=== GLOSSARY ===")
    glossary = sb.table('glossary').select('id, term, playlist_id', count='exact').execute()
    print(f"Total glossary terms: {glossary.count}")
    if glossary.data:
        print(f"Sample terms: {', '.join([g['term'] for g in glossary.data[:10]])}")
    
    # Check QA pairs
    print("\n=== QA PAIRS ===")
    qa = sb.table('qa_pairs').select('id, question', count='exact').execute()
    print(f"Total QA pairs: {qa.count}")
    if qa.data:
        print(f"Sample questions:")
        for q in qa.data[:3]:
            print(f"  - {q['question'][:80]}...")
    
    # Check video keywords
    print("\n=== VIDEO KEYWORDS ===")
    keywords = sb.table('video_keywords').select('id', count='exact').execute()
    print(f"Total keywords: {keywords.count}")
    
    # Check concept heatmaps
    print("\n=== CONCEPT HEATMAPS ===")
    heatmaps = sb.table('concept_heatmaps').select('id, term', count='exact').execute()
    print(f"Total heatmaps: {heatmaps.count}")
    
    print("\n" + "=" * 60)
    print("DIAGNOSTIC COMPLETE")
    print("=" * 60)

if __name__ == "__main__":
    check_database()
