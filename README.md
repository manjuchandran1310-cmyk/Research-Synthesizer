# SynthXis — AI Research Agent for Chrome

Load up to 3 academic papers side by side and run AI analysis across all of them simultaneously. Every finding links back to the exact page in the exact paper it came from.

Built as a Chrome extension. Free to use with your own Groq API key.

## Features
- Drag-and-drop PDF upload or paste any URL
- Side-by-side paper comparison (up to 3 papers)
- AI agent analyses all papers simultaneously
- Findings linked back to source pages with one-click navigation
- Floating draggable agent panel
- Free — uses Groq API (free tier, no credit card needed)

## Setup

### 1. Download PDF.js (required)
The extension needs PDF.js bundled locally due to Chrome extension security rules.

Download these two files and place them in the extension folder:
- https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js
- https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js

### 2. Get a free Groq API key
1. Go to console.groq.com
2. Sign in with Google
3. Click API Keys → Create API Key
4. Copy the key (starts with gsk_...)

### 3. Load into Chrome
1. Open Chrome → go to chrome://extensions
2. Toggle on Developer mode (top right)
3. Click Load unpacked → select this folder
4. Click the SynthXis icon in your toolbar
5. Click ⚙ in the agent panel → paste your Groq key → Save

## How to use
1. Drop a PDF onto any paper column (or paste a URL and press Enter)
2. Load a second or third paper the same way
3. Select question chips in the agent panel
4. Click Run ↗
5. Click any source chip to jump to that page in the paper

## Tech stack
- Pure HTML/CSS/JS — no build tools, no npm
- PDF.js for PDF rendering
- Groq API (llama-3.3-70b-versatile) for analysis
- Chrome Extension Manifest V3

## Licence
MIT
