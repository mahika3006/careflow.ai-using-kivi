# CareFlow.ai — Human-in-the-Loop Healthcare Triage Platform (Powered by Kivi Voice)

CareFlow.ai is an intelligent, multimodal clinical triage and patient prioritization platform designed to assist doctors, triage nurses, and healthcare clinicians in real-time hospital and clinic environments.

---

## Key Capabilities

- **Kivi Voice Multimodal Intake (STT & TTS)**:
  - Powered by **Kivi Voice** (Sarvam AI Saaras v4 STT & Bulbul v3 TTS) for high-accuracy multilingual verbal patient statements and prescription audio playback in 11+ Indian languages (Hindi, English, Bengali, Tamil, Telugu, Marathi, Gujarati, Kannada, Malayalam, Punjabi, Odia).
- **Sub-3s Clinical Urgency Safety Screening**:
  - Accelerated clinical decision support engine providing observable urgency signals, grounding quotes from history and present symptoms, missing vitals checks, and life-saving first aid steps.
- **Human-in-the-Loop Decision Support**:
  - AI does not diagnose or make final decisions; clinicians review, confirm, or override triage priority ranks.
- **Multimodal Document Understanding**:
  - Instant PDF medical report narrative extraction (past conditions, active medications, allergies, previous vitals).
- **Doctor Queue & Clinical Assignment**:
  - Real-time triage queues, specialty routing, and printable consultation reports.

---

## Tech Stack

- **Framework**: Next.js 16.4.2 (App Router with Turbopack)
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS 4
- **Voice Engine**: Kivi Voice / Sarvam AI SDK (`sarvamai`)
- **AI Decision Support**: Google Gemini / Gemma AI Integration
- **Database / Auth**: Supabase SSR Client

---

## Getting Started

### 1. Prerequisites
- Node.js 18+ (tested on Node v20+)
- npm or yarn

### 2. Environment Setup
Create a `.env.local` file from `.env.example`:

```bash
# Kivi / Sarvam AI Speech Integration (STT & TTS)
SARVAM_API_KEY=your_sarvam_api_key_here
KIVI_API_KEY=your_kivi_api_key_here

# Gemini / Gemma AI Integration
GEMINI_API_KEY=your_gemini_api_key_here

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Verification & Tests

To run the verification test suites:

- **Kivi Voice Test**:
  ```bash
  node scripts/test_kivi_voice.mjs
  ```
- **Screening Speed Benchmark**:
  ```bash
  node scripts/benchmark_speed.mjs
  ```
- **Full Clinical Acceptance Suite (A–F)**:
  ```bash
  node scripts/run_acceptance_tests.mjs
  ```
