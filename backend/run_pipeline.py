#!/usr/bin/env python3
"""
Direct pipeline runner script.
Run playlists sequentially without going through the FastAPI backend.
"""

import sys
import logging
from tasks.pipeline import process_playlist

# Configure logging to see progress
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    datefmt='%H:%M:%S'
)

logger = logging.getLogger(__name__)


def main():
    """Process playlists from command line arguments."""
    if len(sys.argv) < 2:
        print("Usage: python run_pipeline.py <playlist_id_1> [playlist_id_2] ...")
        print("\nExample:")
        print("  python run_pipeline.py 627d02a2-b0ad-4993-8345-9e6e88338214")
        sys.exit(1)
    
    playlist_ids = sys.argv[1:]
    
    logger.info("=" * 60)
    logger.info(f"Starting sequential processing of {len(playlist_ids)} playlist(s)")
    logger.info("=" * 60)
    
    for i, playlist_id in enumerate(playlist_ids, 1):
        logger.info("")
        logger.info("─" * 60)
        logger.info(f"PLAYLIST {i}/{len(playlist_ids)}: {playlist_id}")
        logger.info("─" * 60)
        
        try:
            process_playlist(playlist_id)
            logger.info(f"✓ Playlist {i} completed successfully")
        except Exception as exc:
            logger.error(f"✗ Playlist {i} failed: {exc}", exc_info=True)
            # Continue to next playlist even if one fails
            continue
    
    logger.info("")
    logger.info("=" * 60)
    logger.info("All playlists processed")
    logger.info("=" * 60)


if __name__ == "__main__":
    main()
