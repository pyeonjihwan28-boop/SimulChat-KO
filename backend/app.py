from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
import logging
import threading
import time
from collections import deque
import base64
import os
import tempfile
import subprocess
from pydub import AudioSegment
import speech_recognition as sr
import random
import re  # Using SpeechRecognition instead
import shutil # For checking ffmpeg
import json
import queue
from queue import Queue
from threading import Thread

app = Flask(__name__)
CORS(app)

# Configure logging
logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = app.logger

# --- Speech Recognition Setup ---
# Initialize recognizer here, after imports
recognizer = sr.Recognizer()
logger.info("SpeechRecognition initialized")

# --- Visual Context Storage ---
# Store camera and screen images separately
current_camera_image_base64 = None
current_screen_image_base64 = None
# For a one-time uploaded image that takes precedence
current_uploaded_image_base64 = None 

# Add timestamps to track when contexts were last updated
context_timestamps = {
    'camera': 0,
    'screen': 0,
    'upload': 0
}

# --- ASYNC VISUAL ANALYSIS SYSTEM ---
# Pre-computed visual analysis results (non-blocking)
visual_analysis_results = {
    'camera': {'description': '', 'text': [], 'objects': [], 'actions': [], 'timestamp': 0},
    'screen': {'description': '', 'text': [], 'objects': [], 'actions': [], 'timestamp': 0},
    'upload': {'description': '', 'text': [], 'objects': [], 'actions': [], 'timestamp': 0}
}

# Background analysis queue and worker
analysis_queue = Queue(maxsize=10)  # Limit queue size to prevent memory issues
analysis_worker_active = False

# Context refresh interval in seconds - reduced to improve responsiveness
CONTEXT_REFRESH_INTERVAL = 5  # Keep context for 5 seconds before considering it "new"

# Check for ffmpeg (still needed for audio conversion)
def check_ffmpeg():
    """Checks if ffmpeg is installed and in PATH."""
    ffmpeg_available = shutil.which("ffmpeg") is not None
    if ffmpeg_available:
        logger.info("ffmpeg found in PATH.")
    else:
        logger.warning("ffmpeg not found in PATH. Audio conversion may fail.")
    return ffmpeg_available

# Check ffmpeg on startup
ffmpeg_available = check_ffmpeg()

# Configuration for Ollama
OLLAMA_BASE_URL = "http://localhost:11434"
OLLAMA_API_CHAT_URL = f"{OLLAMA_BASE_URL}/api/chat"
DEFAULT_OLLAMA_MODEL = "qwen2.5vl:3b"  # Vision-capable model
STALE_CONTEXT_THRESHOLD_SECONDS = 60

# PERFORMANCE OPTIMIZATION: HTTP Session with connection pooling
session = requests.Session()
retry_strategy = Retry(
    total=2,  # Reduced retries for speed
    backoff_factor=0.1,  # Fast backoff
    status_forcelist=[429, 500, 502, 503, 504],
)
adapter = HTTPAdapter(
    max_retries=retry_strategy,
    pool_connections=20,  # Connection pool size
    pool_maxsize=50,      # Max connections per pool
    pool_block=False      # Don't block on pool exhaustion
)
session.mount("http://", adapter)
session.mount("https://", adapter)
# Set optimized timeouts
session.timeout = (2, 10)  # (connect_timeout, read_timeout)

# PERFORMANCE OPTIMIZATION: Response caching
response_cache = {}
CACHE_SIZE_LIMIT = 100  # Limit cache size
CACHE_TTL = 30  # Cache time-to-live in seconds

# Visual context processing variables

# Add a cache for recent analysis to avoid redundant processing
last_analysis_time = {
    'camera': 0,
    'screen': 0,
    'upload': 0
}
analysis_cache = {
    'camera': None,
    'screen': None,
    'upload': None
}
ANALYSIS_CACHE_TIMEOUT = 8  # seconds

# Add a simple queue system for visual context updates
visual_context_queue = Queue(maxsize=10)  # Limit queue size to prevent memory issues
is_processing_queue = False

def filter_authentic_twitch_response(response):
    """OPTIMIZED Filter - Fast performance for high-volume chat"""
    if not response:
        return "KEKW"  # Fallback emote
    
    # FAST numbered list removal (no regex)
    if '. ' in response and any(char.isdigit() for char in response[:10]):
        # Simple numbered list detection and removal
        lines = response.split('\n')
        cleaned_lines = []
        for line in lines:
            if not (len(line) > 0 and line[0].isdigit() and '. ' in line[:5]):
                cleaned_lines.append(line)
        response = ' '.join(cleaned_lines)
    
    # FAST word limiting (no regex)
    words = response.split()
    if len(words) > 12:
        words = words[:12]
    
    # FAST join and strip
    filtered = ' '.join(words).strip()
    
    # FAST punctuation removal (no regex)
    filtered = filtered.replace('.', '').replace('!', '').replace('?', '').replace(',', '').replace(':', '').replace(';', '')
    
    # FAST length check with fallback
    if len(filtered) > 80 or not filtered:
        fallbacks = ['KEKW', 'LULW', 'POG', 'based', 'cringe', 'nice', 'yikes']
        return fallbacks[hash(response) % len(fallbacks)]  # Deterministic but fast
    
    return filtered

def process_visual_context_queue():
    """Fast, non-blocking queue processing"""
    global is_processing_queue
    
    if is_processing_queue:
        return
    
    is_processing_queue = True
    
    try:
        while not visual_context_queue.empty():
            context_update = visual_context_queue.get_nowait()
            update_context_internal(context_update['image_base64'], context_update['context_type'])
            # Trigger async analysis in background
            trigger_async_visual_analysis(context_update['image_base64'], context_update['context_type'])
            logger.info(f"Processed queued visual context update: {context_update['context_type']}")
    finally:
        is_processing_queue = False

def update_context_internal(img_b64, context_type):
    """Fast and simple visual context update"""
    global current_uploaded_image_base64, current_camera_image_base64, current_screen_image_base64
    global context_timestamps
    
    current_time = time.time()
    
    if context_type == 'upload':
        current_uploaded_image_base64 = img_b64
        context_timestamps['upload'] = current_time
    elif context_type == 'camera':
        current_camera_image_base64 = img_b64
        context_timestamps['camera'] = current_time
    elif context_type == 'screen':
        current_screen_image_base64 = img_b64
        context_timestamps['screen'] = current_time
    
    logger.info(f"Updated {context_type} context at {current_time}")

@app.route('/api/update-visual-context', methods=['POST'])
def update_visual_context():
    global is_processing_queue
    try:
        data = request.get_json()
        if not data or 'image_base64' not in data or 'context_type' not in data:
            logger.error("Missing image_base64 or context_type in request to /api/update-visual-context")
            return jsonify({"error": "Missing image_base64 or context_type"}), 400
        
        img_b64 = data['image_base64']
        context_type = data['context_type'] # 'camera', 'screen', or 'upload'
        
        logger.info(f"Received visual context update request. Type: {context_type}, data length: {len(img_b64) if img_b64 else 0} bytes")

        if not isinstance(img_b64, str) or not img_b64:
            logger.error("Invalid image_base64 format or empty.")
            return jsonify({"error": "Invalid image_base64 format"}), 400
        
        # Strip the data URI prefix if present, Ollama expects pure base64
        if img_b64.startswith("data:image/") and ";base64," in img_b64:
            img_b64 = img_b64.split(",", 1)[1]

        # Queue the context update instead of processing it immediately
        if not visual_context_queue.full():
            visual_context_queue.put({
                'image_base64': img_b64,
                'context_type': context_type,
                'timestamp': time.time()
            })
            
            # Start processing the queue if not already processing
            if not is_processing_queue:
                Thread(target=process_visual_context_queue).start()
                
            # For uploads or if detailed analysis is requested, process immediately
            if context_type == 'upload' or data.get('detailed_analysis', False):
                update_context_internal(img_b64, context_type)
                
            description = ""
            analysis_data = None
            
            # Only perform analysis if detailed_analysis is requested
            if data.get('detailed_analysis', False):
                try:
                    analysis_data = perform_visual_analysis(img_b64, context_type)
                    description = analysis_data.get('description', '')
                except Exception as analysis_error:
                    logger.error(f"Error during visual analysis: {analysis_error}", exc_info=True)
            
            return jsonify({
                "message": f"Visual context for {context_type} queued successfully",
                "description": description,
                "analysis": analysis_data
            }), 200
        else:
            logger.warning(f"Visual context queue is full, dropping {context_type} update")
            return jsonify({"message": f"Visual context queue is full, update skipped"}), 202
            
    except Exception as e:
        logger.error(f"Error updating visual context: {e}", exc_info=True)
        return jsonify({"error": f"An unexpected error occurred: {str(e)}"}), 500

# NEW: Function to perform visual analysis using Ollama
def perform_visual_analysis(image_base64, context_type):
    """Analyze the visual content using Ollama vision capabilities."""
    global last_analysis_time, analysis_cache
    
    current_time = time.time()
    
    # Check if we have a recent analysis in cache
    if (current_time - last_analysis_time.get(context_type, 0) < ANALYSIS_CACHE_TIMEOUT and 
        analysis_cache.get(context_type) is not None):
        logger.info(f"Using cached analysis for {context_type}, age: {current_time - last_analysis_time.get(context_type):.2f}s")
        return analysis_cache[context_type]
    
    try:
        # Create a simple prompt for visual analysis
        analysis_prompt = (
            "Analyze this image and provide the following information as a structured response:\n"
            "1. A brief description of what you see (1-2 sentences)\n"
            "2. List any visible text (words, numbers, signs)\n"
            "3. List key objects or people visible\n"
            "4. List any notable actions or movements\n"
            "Format your response as a simple JSON with keys: 'description', 'text', 'objects', 'actions'"
        )
        
        # Create message payload with image
        message = {
            'role': 'user',
            'content': analysis_prompt,
            'images': [image_base64]
        }
        
        # Send to Ollama with reduced token generation for faster response
        payload = {
            "model": DEFAULT_OLLAMA_MODEL,
            "messages": [message],
            "stream": False,
            "options": {"temperature": 0.1, "num_predict": 80}  # Reduced from 100 to 80 for faster analysis
        }
        
        logger.info(f"Sending image analysis request to Ollama for {context_type}")
        response = requests.post(OLLAMA_API_CHAT_URL, json=payload)
        response.raise_for_status()
        
        # Process response
        response_data = response.json()
        response_text = response_data.get("message", {}).get("content", "").strip()
        
        # Try to extract JSON from the response
        analysis = {}
        try:
            # Look for JSON-like content in the response
            import re
            json_match = re.search(r'```json\s*([\s\S]*?)\s*```', response_text)
            if json_match:
                json_str = json_match.group(1)
                analysis = json.loads(json_str)
            else:
                # If no JSON block found, try to parse the whole response
                analysis = json.loads(response_text)
        except json.JSONDecodeError:
            # If JSON parsing fails, extract information using regex
            description_match = re.search(r'description["\']?\s*:?\s*["\']?(.*?)["\']?[,}]', response_text, re.IGNORECASE)
            text_match = re.search(r'text["\']?\s*:?\s*\[(.*?)\]', response_text, re.IGNORECASE | re.DOTALL)
            objects_match = re.search(r'objects["\']?\s*:?\s*\[(.*?)\]', response_text, re.IGNORECASE | re.DOTALL)
            actions_match = re.search(r'actions["\']?\s*:?\s*\[(.*?)\]', response_text, re.IGNORECASE | re.DOTALL)
            
            analysis = {
                "description": description_match.group(1).strip() if description_match else "",
                "text": [item.strip().strip('"\'') for item in text_match.group(1).split(',')] if text_match else [],
                "objects": [item.strip().strip('"\'') for item in objects_match.group(1).split(',')] if objects_match else [],
                "actions": [item.strip().strip('"\'') for item in actions_match.group(1).split(',')] if actions_match else []
            }
        
        # Ensure we have all expected keys
        if "description" not in analysis:
            analysis["description"] = ""
        if "text" not in analysis:
            analysis["text"] = []
        if "objects" not in analysis:
            analysis["objects"] = []
        if "actions" not in analysis:
            analysis["actions"] = []
            
        # Update cache
        last_analysis_time[context_type] = current_time
        analysis_cache[context_type] = analysis
            
        logger.info(f"Visual analysis complete for {context_type}. Found {len(analysis['text'])} text items, {len(analysis['objects'])} objects")
        return analysis
        
    except Exception as e:
        logger.error(f"Error in visual analysis: {e}", exc_info=True)
        return {
            "description": "",
            "text": [],
            "objects": [],
            "actions": []
        }

# --- ASYNC VISUAL ANALYSIS SYSTEM ---
def start_analysis_worker():
    """Start the background visual analysis worker thread"""
    global analysis_worker_active
    if not analysis_worker_active:
        analysis_worker_active = True
        worker_thread = Thread(target=visual_analysis_worker, daemon=True)
        worker_thread.start()
        logger.info("Visual analysis worker started")

def visual_analysis_worker():
    """Background worker that processes visual analysis requests"""
    global analysis_worker_active
    logger.info("Visual analysis worker thread started")
    
    while analysis_worker_active:
        try:
            # Wait for analysis request (blocks until available)
            analysis_request = analysis_queue.get(timeout=5.0)
            if analysis_request is None:  # Shutdown signal
                break
                
            image_base64 = analysis_request['image_base64']
            context_type = analysis_request['context_type']
            
            # Perform the analysis (this is the slow part, now in background)
            analysis_result = perform_visual_analysis_sync(image_base64, context_type)
            
            # Store result for chat agents to use
            visual_analysis_results[context_type] = {
                **analysis_result,
                'timestamp': time.time()
            }
            
            logger.info(f"Background analysis complete for {context_type}")
            
        except queue.Empty:
            continue  # Timeout, check if we should keep running
        except Exception as e:
            logger.error(f"Error in visual analysis worker: {e}", exc_info=True)
    
    logger.info("Visual analysis worker stopped")

def trigger_async_visual_analysis(image_base64, context_type):
    """Trigger visual analysis in background (non-blocking)"""
    try:
        # Add to analysis queue (non-blocking)
        analysis_request = {
            'image_base64': image_base64,
            'context_type': context_type
        }
        analysis_queue.put_nowait(analysis_request)
        logger.info(f"Queued visual analysis for {context_type}")
    except queue.Full:
        logger.warning(f"Analysis queue full, skipping {context_type} analysis")

def perform_visual_analysis_sync(image_base64, context_type):
    """Synchronous visual analysis (runs in background thread)"""
    try:
        # Create a simple prompt for visual analysis
        analysis_prompt = (
            "Analyze this image briefly and provide JSON with keys: 'description', 'text', 'objects', 'actions'. "
            "Keep description to 1-2 sentences. List key visible text, objects, and actions."
        )
        
        # Create message payload with image
        message = {
            'role': 'user',
            'content': analysis_prompt,
            'images': [image_base64]
        }
        
        # Send to Ollama with optimized settings for background processing
        payload = {
            "model": DEFAULT_OLLAMA_MODEL,
            "messages": [message],
            "stream": False,
            "options": {
                "temperature": 0.1, 
                "num_predict": 60,  # Reduced for faster processing
                "num_ctx": 2048,    # Smaller context window
                "top_k": 20,       # Faster sampling
                "top_p": 0.8
            }
        }
        
        response = session.post(OLLAMA_API_CHAT_URL, json=payload, timeout=10)
        response.raise_for_status()
        
        # Process response
        response_data = response.json()
        response_text = response_data.get("message", {}).get("content", "").strip()
        
        # Try to extract JSON from the response
        analysis = {}
        try:
            # Look for JSON-like content in the response
            json_match = re.search(r'```json\s*([\s\S]*?)\s*```', response_text)
            if json_match:
                json_str = json_match.group(1)
                analysis = json.loads(json_str)
            else:
                # If no JSON block found, try to parse the whole response
                analysis = json.loads(response_text)
        except json.JSONDecodeError:
            # If JSON parsing fails, create minimal analysis
            analysis = {
                "description": response_text[:100] if response_text else "Visual content detected",
                "text": [],
                "objects": [],
                "actions": []
            }
        
        # Ensure we have all expected keys
        for key in ['description', 'text', 'objects', 'actions']:
            if key not in analysis:
                analysis[key] = [] if key != 'description' else ""
            
        return analysis
        
    except Exception as e:
        logger.error(f"Error in sync visual analysis: {e}")
        return {
            "description": "Analysis unavailable",
            "text": [],
            "objects": [],
            "actions": []
        }

def get_visual_context_for_chat(context_type):
    """Get pre-computed visual analysis for chat (non-blocking)"""
    result = visual_analysis_results.get(context_type, {})
    
    # Check if analysis is recent (within 30 seconds)
    if result.get('timestamp', 0) > time.time() - 30:
        return result
    else:
        # Return empty analysis if too old
        return {
            'description': '',
            'text': [],
            'objects': [],
            'actions': [],
            'timestamp': 0
        }

@app.route('/api/get-ai-response', methods=['POST'])
def get_ai_response():
    global current_camera_image_base64, current_screen_image_base64, current_uploaded_image_base64, context_timestamps
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No input data provided"}), 400

        system_prompt = data.get('system_prompt', '')
        transcribed_input = data.get('transcribed_input', '')
        model_name = data.get('model_name', DEFAULT_OLLAMA_MODEL)
        visual_context_memory = data.get('visual_context_memory', {})
        agent_name = data.get('agent_name', 'Unknown')
        recent_messages = data.get('recent_messages', [])

        # --- NON-BLOCKING Visual Context Selection ---
        STALE_CONTEXT_THRESHOLD_SECONDS = 60
        image_to_use = None
        image_source = "none"
        visual_analysis = None
        current_time = time.time()

        # Prioritize contexts in this order: upload > screen > camera
        # Get both image and pre-computed analysis (non-blocking)
        if current_uploaded_image_base64 and (current_time - context_timestamps.get('upload', 0)) < STALE_CONTEXT_THRESHOLD_SECONDS:
            image_to_use = current_uploaded_image_base64
            image_source = "uploaded image"
            visual_analysis = get_visual_context_for_chat('upload')
        elif current_screen_image_base64 and (current_time - context_timestamps.get('screen', 0)) < STALE_CONTEXT_THRESHOLD_SECONDS:
            image_to_use = current_screen_image_base64
            image_source = "screen"
            visual_analysis = get_visual_context_for_chat('screen')
        elif current_camera_image_base64 and (current_time - context_timestamps.get('camera', 0)) < STALE_CONTEXT_THRESHOLD_SECONDS:
            image_to_use = current_camera_image_base64
            image_source = "camera"
            visual_analysis = get_visual_context_for_chat('camera')

        # --- OPTIMIZED Authentic Twitch Chat Logic (faster performance) ---
        # Contextual Twitch Chat Logic (balanced engagement)
        # Adjust strategies based on context
        has_user_input = transcribed_input and transcribed_input.strip() and transcribed_input != "[no specific streamer input, just make a relevant ambient comment based on your personality]"
        has_visual_context = image_to_use is not None
        has_visual_analysis = visual_analysis and visual_analysis.get('description', '')
        
        if has_user_input or has_visual_context:
            # More engaging responses when there's something to react to
            strategies = [
                ('emote_spam', 0.20),           # Some emote reactions
                ('short_word', 0.15),           # Brief reactions
                ('react_brief', 0.25),          # Quick responses
                ('short_sentence', 0.25),       # More sentences for engagement
                ('longer_response', 0.15)       # NEW: Thoughtful responses
            ]
        else:
            # Idle chat when nothing's happening (waiting for stream)
            strategies = [
                ('emote_spam', 0.30),           # More casual spam
                ('short_word', 0.25),           # Random words
                ('ambient_chat', 0.25),         # Talking among themselves
                ('react_brief', 0.15),          # Random reactions
                ('short_sentence', 0.05)        # Occasional comments
            ]
        
        # Choose strategy
        chosen_strategy = random.choices([s[0] for s in strategies], weights=[s[1] for s in strategies])[0]
        
        # --- Ultra-Simple Prompt Construction ---
        prompt_parts = [system_prompt]

        # ENHANCED CONTEXTUAL INTERACTION: Handle mode-specific contexts
        is_music_mode = "[MUSIC DETECTED" in transcribed_input
        is_visual_mode = "[VISUAL CONTEXT ACTIVE" in transcribed_input
        is_reply_mode = "[DIRECT REPLY MODE" in transcribed_input
        
        if is_music_mode:
            # MUSIC MODE: High energy, dance emotes, fast responses
            should_respond = random.random() < 0.9  # 90% response rate for music
            if should_respond:
                prompt_parts.append("MUSIC IS PLAYING! React with high energy, dance emotes, and music-related responses. Be hyped!")
            else:
                prompt_parts.append("Chat naturally with music energy.")
        elif is_reply_mode or has_user_input:
            # REPLY MODE: High engagement, longer responses
            should_respond_to_user = random.random() < 0.85  # Increased from 75% to 85%
            
            if should_respond_to_user:
                prompt_parts.append(f"User said: \"{transcribed_input.split('[')[0].strip()}\". Give a relevant, engaging response. Be conversational and helpful.")
            else:
                prompt_parts.append("Chat naturally based on your personality.")
        elif is_visual_mode or has_visual_context:
            # VISUAL MODE: Comment on what's seen (using pre-computed analysis)
            should_respond_to_visual = random.random() < 0.75  # Increased from 60% to 75%
            if should_respond_to_visual and has_visual_analysis:
                # Use pre-computed analysis for faster responses
                visual_desc = visual_analysis.get('description', '')
                visual_objects = visual_analysis.get('objects', [])
                visual_text = visual_analysis.get('text', [])
                
                context_info = f"Visual context: {visual_desc}"
                if visual_objects:
                    context_info += f" Objects: {', '.join(visual_objects[:3])}"
                if visual_text:
                    context_info += f" Text: {', '.join(visual_text[:2])}"
                    
                prompt_parts.append(f"{context_info}. React to what you see. Be observant and engaging.")
            else:
                prompt_parts.append("Chat naturally based on your personality.")
        else:
            # Idle chat - agents talk among themselves
            prompt_parts.append("Chat naturally as if waiting for the stream to start. Talk among yourselves.")
        
        # Apply MODE-AWARE contextual strategies
        if chosen_strategy == "emote_spam":
            if is_music_mode:
                prompt_parts.append("React with 2-3 dance/music emotes! Examples: 'catJAM', 'VIBE catJAM', 'catJAM BANGER'.")
            elif is_reply_mode or is_visual_mode or has_user_input or has_visual_context:
                prompt_parts.append("React with 1-2 relevant emotes that match the situation or what the user said.")
            else:
                prompt_parts.append("Respond with ONLY 1-2 emotes. Examples: 'KEKW', 'LULW', 'POG', 'GIGACHAD', 'based'.")
            
        elif chosen_strategy == "short_word":
            if is_music_mode:
                prompt_parts.append("Give a 1-3 word music reaction. Examples: 'BANGER', 'catJAM', 'vibes', 'nice beat'.")
            elif is_reply_mode or is_visual_mode or has_user_input or has_visual_context:
                prompt_parts.append("Give a 1-3 word response that directly relates to the situation.")
            else:
                prompt_parts.append("Respond with 1-2 words only. Examples: 'nice', 'cringe', 'yikes', 'based', 'true'.")
            
        elif chosen_strategy == "react_brief":
            if is_music_mode:
                prompt_parts.append("Give a brief 2-4 word music reaction. Examples: 'this slaps', 'catJAM vibes', 'dance mode'.")
            elif is_reply_mode or is_visual_mode or has_user_input or has_visual_context:
                prompt_parts.append("Give a brief 2-5 word reaction that shows you're engaged with what's happening.")
            else:
                prompt_parts.append("Brief reaction, 1-3 words max. Examples: 'poggers', 'bruh', 'same', 'facts'.")
            
        elif chosen_strategy == "short_sentence":
            if is_music_mode:
                prompt_parts.append("Give a 4-8 word music response. Examples: 'this song is a banger', 'catJAM time to dance', 'love this beat'.")
            elif is_reply_mode or is_visual_mode or has_user_input or has_visual_context:
                prompt_parts.append("Give a helpful 4-10 word response that directly engages with the situation. Be more conversational.")
            else:
                prompt_parts.append("Sometimes use a short sentence, 3-6 words max. Examples: 'that was good', 'I like this', 'not bad tbh', 'pretty cool ngl'.")
                
        elif chosen_strategy == "longer_response":
            if is_music_mode:
                prompt_parts.append("Give a 6-12 word music response. Examples: 'this track is absolutely perfect for dancing catJAM', 'loving the energy of this song right now'.")
            elif is_reply_mode or has_user_input:
                prompt_parts.append("Give a thoughtful 6-15 word response that properly engages with what the user said. Be helpful and conversational.")
            elif is_visual_mode or has_visual_context:
                prompt_parts.append("Give a 6-12 word observation about what you see. Be descriptive but concise.")
            else:
                prompt_parts.append("Make a casual 4-10 word comment based on your personality.")
                
        elif chosen_strategy == "ambient_chat":
            if is_music_mode:
                prompt_parts.append("Chat about music casually. 3-8 words. Examples: 'anyone know this song', 'catJAM this is fire', 'dance party in chat'.")
            else:
                prompt_parts.append("Chat casually as if talking to other viewers while waiting. 3-8 words. Examples: 'anyone else hyped for this', 'chat moving kinda slow', 'when does stream start'.")
            
        elif chosen_strategy == "short_comment":
            prompt_parts.append(
                f"\nSTRATEGY: Make a brief comment about the user's message. 3-6 words max. "
                f"Examples: 'nice choice', 'sounds fun', 'same here', 'good taste'."
            )
            
        elif chosen_strategy == "ask_question":
            prompt_parts.append(
                f"\nSTRATEGY: Ask a very short question (4-6 words). Examples: 'what rank?', 'solo or team?', 'favorite map?'. "
                f"Don't use @CurrentUser unless necessary."
            )
            
        elif chosen_strategy == "emote_only":
            prompt_parts.append(
                f"\nSTRATEGY: Respond with ONLY emotes. Pick 1-3 emotes that fit your personality. "
                f"Examples: 'LULW', 'Poggers EZ', 'monkaS', '5Head GIGACHAD', 'FeelsGoodMan'."
            )
            
        else:  # fallback for any other strategy
            if has_user_input or has_visual_context:
                prompt_parts.append("Chat naturally about the situation, based on your personality. 2-6 words.")
            else:
                prompt_parts.append("Chat naturally based on your personality. 1-4 words max.")
        
        # Simple repetition avoidance
        if recent_messages:
            recent_topics = [msg.get('content', '') for msg in recent_messages if msg.get('author') == agent_name]
            if recent_topics:
                prompt_parts.append(f"Don't repeat: {' | '.join(recent_topics[-2:])}. Say something different.")
        
        # Contextual Twitch chat rules (allows longer responses when appropriate)
        if has_user_input or has_visual_context:
            prompt_parts.append(
                "\nENGAGED CHAT RULES:\n"
                "- 1-12 words max (be contextual)\n"
                "- NO numbered lists (1. 2. 3.)\n"
                "- Be conversational and helpful\n"
                "- Match the energy of the situation\n"
            )
        else:
            prompt_parts.append(
                "\nIDLE CHAT RULES:\n"
                "- 1-8 words max\n"
                "- NO numbered lists (1. 2. 3.)\n"
                "- Chat casually like waiting for stream\n"
                "- Talk among yourselves\n"
                "- Examples: 'KEKW', 'based', 'cringe', 'yikes', 'poggers', 'nice'\n"
                "- BAD: '1. LULW 2. KEKW' or 'That sweater looks cozy'\n"
                "- GOOD: 'KEKW', 'based', 'cringe'"
            )

        # --- Final Prompt Assembly ---
        # Combine all parts into a single prompt string
        final_prompt = "\n\n".join(prompt_parts)
        
        # --- Ollama Payload (NO IMAGES - using pre-computed analysis) ---
        # PERFORMANCE OPTIMIZATION: Don't send images to chat agents
        # Visual analysis is already computed in background
        message_for_ollama = {
            'role': 'user',
            'content': final_prompt
        }
        # NOTE: Removed image sending to eliminate visual processing bottleneck
            
        ollama_payload = {
            "model": model_name,
            "messages": [message_for_ollama],
            "stream": False,
            "options": {
                "temperature": 0.85, 
                "num_predict": 80,
                "repeat_penalty": 1.15,
                "num_ctx": 2048,        # Reduced context window for speed
                "num_batch": 512,       # Optimized batch size
                "num_gpu_layers": -1,   # Use all GPU layers if available
                "low_vram": False,      # Disable low VRAM mode for speed
                "f16_kv": True,         # Use FP16 for key-value cache
                "use_mlock": True,      # Lock model in memory
                "num_thread": 8         # Optimize thread count
            }
        }

        logger.info(f"Sending payload to Ollama for model {model_name}. Image attached: {'Yes' if image_to_use else 'No'}")
        
        # Use optimized session with connection pooling
        response = session.post(OLLAMA_API_CHAT_URL, json=ollama_payload)
        response.raise_for_status()

        response_data = response.json()
        ai_message = response_data.get("message", {}).get("content", "").strip()
        
        # Post-process to ensure authentic Twitch chat format
        ai_message = filter_authentic_twitch_response(ai_message)

        logger.info(f"Received from {model_name}: {ai_message}")
        return jsonify({"ai_message": ai_message})

    except requests.exceptions.RequestException as e:
        logger.error(f"Could not connect to Ollama: {e}", exc_info=True)
        return jsonify({"error": f"Could not connect to Ollama: {str(e)}"}), 503
    except Exception as e:
        logger.error(f"An unexpected error occurred in get_ai_response: {e}", exc_info=True)
        return jsonify({"error": f"An unexpected error occurred: {str(e)}"}), 500

@app.route('/api/transcribe-audio', methods=['POST'])
def transcribe_audio():
    logger.info(f"Received transcribe-audio request. Content-Type: {request.content_type}")
    logger.info(f"Request headers: {dict(request.headers)}")
    
    if not ffmpeg_available:
        logger.error("ffmpeg not found. Cannot process audio.")
        return jsonify({"error": "ffmpeg is not installed or not in PATH. Audio processing unavailable."}), 500

    # Log all form data and files
    logger.info(f"Form data: {dict(request.form)}")
    logger.info(f"Files: {list(request.files.keys())}")
    
    if 'audio_file' not in request.files:
        logger.error("No 'audio_file' in request.files. Keys found: " + str(list(request.files.keys())))
        return jsonify({"error": "No audio file part"}), 400
    
    file = request.files['audio_file']
    if file.filename == '':
        logger.error("File has no filename")
        return jsonify({"error": "No selected file"}), 400

    logger.info(f"Received audio file: {file.filename}, content type: {file.content_type}")
    
    # Determine format based on file extension or content type
    audio_format = None
    if file.filename.endswith('.webm'):
        audio_format = 'webm'
    elif file.filename.endswith('.ogg'):
        audio_format = 'ogg'
    elif file.filename.endswith('.wav'):
        audio_format = 'wav'
    elif file.filename.endswith('.mp3') or file.filename.endswith('.mp4'):
        audio_format = 'mp3'
    elif 'webm' in file.content_type:
        audio_format = 'webm'
    elif 'ogg' in file.content_type:
        audio_format = 'ogg'
    elif 'wav' in file.content_type:
        audio_format = 'wav'
    elif 'mp3' in file.content_type or 'mp4' in file.content_type:
        audio_format = 'mp3'
    else:
        # Default to webm if we can't determine the format
        audio_format = 'webm'
        
    logger.info(f"Detected audio format: {audio_format}")
    
    # Define input_file_path and wav_file_path at a higher scope
    input_file_path = None
    wav_file_path = None
    
    try:
        # Save the uploaded file to a temporary file with the appropriate extension
        with tempfile.NamedTemporaryFile(delete=False, suffix=f'.{audio_format}') as tmp_audio_file:
            file.save(tmp_audio_file.name)
            input_file_path = tmp_audio_file.name
        
        logger.info(f"Audio file saved temporarily to: {input_file_path}")

        # Convert to WAV using pydub (which uses ffmpeg)
        # Create a temporary WAV file
        with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as tmp_wav_file:
            wav_file_path = tmp_wav_file.name
        
        # Convert to WAV
        try:
            logger.info(f"Converting {audio_format.upper()} to WAV: {input_file_path} -> {wav_file_path}")
            audio = AudioSegment.from_file(input_file_path, format=audio_format)
            audio.export(wav_file_path, format="wav")
            logger.info(f"Conversion successful")
        except Exception as e:
            logger.error(f"Error converting audio: {e}", exc_info=True)
            # Clean up temp files created so far before returning
            if input_file_path and os.path.exists(input_file_path):
                os.remove(input_file_path)
            if wav_file_path and os.path.exists(wav_file_path):
                os.remove(wav_file_path)
            return jsonify({"error": f"Failed to convert audio: {str(e)}"}), 500

        # Recognize speech using Google Web API
        try:
            logger.info("Starting transcription with Google Web API")
            with sr.AudioFile(wav_file_path) as source:
                audio_data = recognizer.record(source)
                transcript_text = recognizer.recognize_google(audio_data)
                logger.info(f"Google transcription successful. Transcript: {transcript_text}")
                return jsonify({"transcript": transcript_text}), 200
        except sr.UnknownValueError:
            logger.warning("Google could not understand audio")
            return jsonify({"error": "Could not understand audio"}), 400
        except sr.RequestError as e:
            logger.error(f"Could not request results from Google Speech Recognition service: {e}", exc_info=True)
            return jsonify({"error": f"Speech recognition service error: {str(e)}"}), 500
    except Exception as e:
        logger.error(f"An unexpected error occurred in transcribe_audio: {e}", exc_info=True)
        return jsonify({"error": f"An unexpected error occurred: {str(e)}"}), 500

if __name__ == '__main__':
    # Start the background visual analysis worker
    logger.info("Starting SimulChat backend with visual analysis optimization...")
    start_analysis_worker()
    
    # Run the Flask app with threading enabled to handle concurrent requests
    logger.info("Starting Flask server on port 5000...")
    app.run(host='0.0.0.0', port=5000, threaded=True)
 