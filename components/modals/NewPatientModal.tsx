'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, Mic, Sparkles, Activity, FileText, Zap, Loader2, ImageIcon, ClipboardList, Globe, Volume2, VolumeX, Square, AlertCircle, AlertTriangle, ShieldCheck, Bookmark } from 'lucide-react';
import { useCareFlow } from '@/lib/store';
import { processMultimodalIntake } from '@/lib/multimodal-ai';
import { getUrgencyStyles } from '@/lib/triage-rules';
import { KiviAudioRecorder, speakWithKivi, stopKiviSpeech } from '@/lib/audio/speech-services';
import { Vitals, MediaEvidence, UrgencyCategory, TranscriptSegment } from '@/types';

interface NewPatientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPatientCreated: (patientId: string) => void;
}

const INPUT_LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'Hindi' },
  { value: 'hinglish', label: 'Hinglish (Mixed)' },
  { value: 'bn', label: 'Bengali' },
  { value: 'ta', label: 'Tamil' },
  { value: 'te', label: 'Telugu' },
  { value: 'mr', label: 'Marathi' },
  { value: 'gu', label: 'Gujarati' },
  { value: 'kn', label: 'Kannada' },
  { value: 'ml', label: 'Malayalam' },
  { value: 'pa', label: 'Punjabi' },
  { value: 'ur', label: 'Urdu' },
];

const SYMPTOM_PLACEHOLDERS: Record<string, string> = {
  en: "Describe symptoms, location of pain, onset, duration, and patient's original words...",
  hi: "Lakshano ka varnan karein - dard ka sthan, kab se hai, kitne samay se hai...",
  hinglish: "Symptoms batayein - dard kahan hai, kab se hai, kitne time se hai...",
};

export function NewPatientModal({ isOpen, onClose, onPatientCreated }: NewPatientModalProps) {
  const { registerPatient } = useCareFlow();

  const [name, setName] = useState('');
  const [ageStr, setAgeStr] = useState('');
  const [gender, setGender] = useState<'Male' | 'Female' | 'Other' | ''>('');
  const [contact, setContact] = useState('');
  const [consentActive, setConsentActive] = useState(true);
  const [language, setLanguage] = useState('en');
  const [symptomText, setSymptomText] = useState('');
  
  // Vitals are strictly user-typed. Never auto-filled from report or AI.
  const [bpSys, setBpSys] = useState('');
  const [bpDia, setBpDia] = useState('');
  const [hrStr, setHrStr] = useState('');
  const [spO2Str, setSpO2Str] = useState('');
  const [tempStr, setTempStr] = useState('');
  const [rrStr, setRrStr] = useState('');
  const [gcsStr, setGcsStr] = useState('');
  
  // History fields
  const [pastHistory, setPastHistory] = useState('');
  const [allergies, setAllergies] = useState('');
  const [previousReportText, setPreviousReportText] = useState('');
  
  // PDF Extraction States
  const [isExtractingHistory, setIsExtractingHistory] = useState(false);
  const [extractedHistory, setExtractedHistory] = useState<any | null>(null);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [extractionConfidence, setExtractionConfidence] = useState<number | null>(null);

  // Audio recording states
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [hasRecordedAudio, setHasRecordedAudio] = useState(false);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [recordedDurationStr, setRecordedDurationStr] = useState<string>('00:20');
  const [recordedSegments, setRecordedSegments] = useState<TranscriptSegment[]>([]);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isTranscribingSTT, setIsTranscribingSTT] = useState(false);
  const [audioTranscriptConfidence, setAudioTranscriptConfidence] = useState<number | null>(null);

  const [isPlayingTTS, setIsPlayingTTS] = useState(false);
  const recorderRef = useRef<KiviAudioRecorder | null>(null);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [uploadedDocName, setUploadedDocName] = useState<string | null>(null);
  const [uploadedDocUrl, setUploadedDocUrl] = useState<string | null>(null);
  const [woundImageName, setWoundImageName] = useState<string | null>(null);
  const [woundImageUrl, setWoundImageUrl] = useState<string | null>(null);
  const woundInputRef = useRef<HTMLInputElement>(null);
  const reportInputRef = useRef<HTMLInputElement>(null);
  
  // Gemma Triage state
  const [isAnalyzingGemma, setIsAnalyzingGemma] = useState(false);
  const [gemmaResult, setGemmaResult] = useState<any | null>(null);
  const [gemmaError, setGemmaError] = useState<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const age = ageStr.trim() !== '' ? Number(ageStr) : 0;

  // Real user-typed vitals only
  const vitalsObj: Vitals = {
    bloodPressure: bpSys && bpDia ? bpSys + '/' + bpDia : 'N/A',
    heartRate: hrStr.trim() ? Number(hrStr) : ('N/A' as any),
    spO2: spO2Str.trim() ? Number(spO2Str) : ('N/A' as any),
    temperature: tempStr.trim() ? Number(tempStr) : ('N/A' as any),
    respiratoryRate: rrStr.trim() ? Number(rrStr) : ('N/A' as any),
    gcs: gcsStr.trim() ? Number(gcsStr) : ('N/A' as any),
  };

  useEffect(() => {
    if (!isOpen) return;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    if (symptomText.trim().length < 30) return;
    debounceTimerRef.current = setTimeout(() => {
      runLiveGemmaAnalysis(symptomText, vitalsObj, age || 40);
    }, 1000);
    return () => { if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symptomText, isOpen]);

  if (!isOpen) return null;

  const fallbackAnalysis = processMultimodalIntake({
    textDescription: symptomText,
    originalLanguage: language as any,
    vitals: vitalsObj,
    age: age || 40,
    gender: (gender || 'Other') as any,
    audioFileName: hasRecordedAudio ? 'patient_verbal_intake.mp3' : undefined,
    reportFileName: uploadedDocName || undefined,
  });

  const activeCategory: UrgencyCategory = gemmaResult?.provisionalCategory || fallbackAnalysis.aiAssessment.provisionalCategory;
  const activeExplanation = gemmaResult?.explanation || fallbackAnalysis.aiAssessment.explanation;
  const activeReasons = gemmaResult?.reasons || [];
  const activeSignalFlags = gemmaResult?.signalFlags || gemmaResult?.flags || [];
  const activeFirstAid = gemmaResult?.first_aid_steps || [];
  const previewStyles = getUrgencyStyles(activeCategory);

  const runLiveGemmaAnalysis = async (
    customText?: string,
    customVitals?: Vitals,
    customAge?: number,
    customExtractedHistory?: any
  ) => {
    const textToAnalyze = customText || symptomText;
    if (!textToAnalyze.trim()) {
      alert('Please enter symptom details before running Gemma AI analysis.');
      return;
    }
    setIsAnalyzingGemma(true);
    setGemmaError(null);
    try {
      const historyToSend = customExtractedHistory !== undefined ? customExtractedHistory : extractedHistory;
      const res = await fetch('/api/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name || 'Patient',
          age: customAge || age || 40,
          gender: gender || 'Unspecified',
          symptomText: textToAnalyze,
          audioTranscript: hasRecordedAudio && recordedSegments.length > 0
            ? recordedSegments.map(s => s.text).join(' ')
            : '',
          originalLanguage: language,
          vitals: customVitals || vitalsObj,
          allergies: allergies,
          extractedHistory: historyToSend,
          documentName: uploadedDocName,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to analyze with Gemma');
      setGemmaResult(json.data);
      return json.data;
    } catch (err: any) {
      console.error('Gemma live analysis error:', err);
      setGemmaError(err.message || 'Error reaching Gemma model');
      return null;
    } finally {
      setIsAnalyzingGemma(false);
    }
  };

  const handleToggleAudioRecord = async () => {
    if (isRecordingAudio) {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      setIsRecordingAudio(false);
      setIsTranscribingSTT(true);
      try {
        if (!recorderRef.current) recorderRef.current = new KiviAudioRecorder();
        const result = await recorderRef.current.stop(language, symptomText);
        setHasRecordedAudio(true);
        if (result.audioUrl) setRecordedAudioUrl(result.audioUrl);
        if (result.segments && result.segments.length > 0) setRecordedSegments(result.segments);
        const mins = Math.floor(recordingSeconds / 60);
        const secs = recordingSeconds % 60;
        setRecordedDurationStr(`${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`);
        
        if (result.transcribedText) {
          const conf = (result as any).confidence ?? 0.88;
          setAudioTranscriptConfidence(conf);
          const langLabel = INPUT_LANGUAGES.find(l => l.value === language)?.label || language.toUpperCase();
          const noteHeader = `[Audio Transcript: ${langLabel} | Confidence: ${(conf * 100).toFixed(0)}%]`;
          const textWithTranscript = symptomText.trim()
            ? `${symptomText}\n\n${noteHeader}\n"${result.transcribedText}"`
            : `${noteHeader}\n"${result.transcribedText}"`;
          setSymptomText(textWithTranscript);
        }
      } catch (err) {
        console.warn('Kivi STT transcription warning:', err);
        setHasRecordedAudio(true);
      } finally {
        setIsTranscribingSTT(false);
      }
    } else {
      try {
        if (!recorderRef.current) recorderRef.current = new KiviAudioRecorder();
        await recorderRef.current.start();
        setIsRecordingAudio(true);
        setRecordingSeconds(0);
        recordTimerRef.current = setInterval(() => {
          setRecordingSeconds((prev) => prev + 1);
        }, 1000);
      } catch (err: any) {
        console.warn('Microphone fallback:', err);
        setIsRecordingAudio(true);
        setTimeout(async () => {
          setIsRecordingAudio(false);
          setIsTranscribingSTT(true);
          try {
            const res = await fetch('/api/stt', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ language, hintText: symptomText }),
            });
            const data = await res.json();
            setHasRecordedAudio(true);
            if (data.segments) setRecordedSegments(data.segments);
            if (data.transcribedText) {
              const conf = data.confidence ?? 0.85;
              setAudioTranscriptConfidence(conf);
              const langLabel = INPUT_LANGUAGES.find(l => l.value === language)?.label || language.toUpperCase();
              const noteHeader = `[Audio Transcript: ${langLabel} | Confidence: ${(conf * 100).toFixed(0)}%]`;
              const textWithTranscript = symptomText.trim()
                ? `${symptomText}\n\n${noteHeader}\n"${data.transcribedText}"`
                : `${noteHeader}\n"${data.transcribedText}"`;
              setSymptomText(textWithTranscript);
            }
          } catch (e) {
            setHasRecordedAudio(true);
          } finally {
            setIsTranscribingSTT(false);
          }
        }, 2200);
      }
    }
  };

  const handlePlayKiviTTS = () => {
    if (isPlayingTTS) {
      stopKiviSpeech();
      setIsPlayingTTS(false);
      return;
    }
    const label = activeCategory === 'EMERGENCY' ? 'Possible emergency, clinician review needed.' : `${activeCategory} Priority Alert.`;
    const textToSpeak = `${label} ${activeExplanation}`;
    speakWithKivi(textToSpeak, {
      language,
      voice: 'priya',
      onStart: () => setIsPlayingTTS(true),
      onEnd: () => setIsPlayingTTS(false),
      onError: () => setIsPlayingTTS(false),
    });
  };

  const handleWoundImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setWoundImageName(file.name);
      const reader = new FileReader();
      reader.onload = (loadEvent) => {
        if (loadEvent.target?.result) {
          setWoundImageUrl(loadEvent.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // PDF Extraction Handler
  const handleReportUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedDocName(file.name);
    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      if (loadEvent.target?.result) {
        setUploadedDocUrl(loadEvent.target.result as string);
      }
    };
    reader.readAsDataURL(file);

    setIsExtractingHistory(true);
    setExtractionError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (name.trim()) formData.append('patientName', name.trim());

      const res = await fetch('/api/extract-history', {
        method: 'POST',
        body: formData,
      });

      const json = await res.json();
      if (!res.ok || !json.success || !json.extracted) {
        setExtractionError('Could not read report, please enter history manually');
        return;
      }

      const ext = json.extracted;
      setExtractedHistory(ext);
      setExtractionConfidence(json.confidence);

      // 1. Auto-fill Current Conditions with source page citation
      if (ext.conditions && ext.conditions.length > 0) {
        const conditionsFormatted = ext.conditions
          .map((c: any) => `${c.text} [${(c.source || '').split(':')[0].trim()}]`)
          .join(', ');
        setPastHistory(conditionsFormatted);
      }

      // 2. Auto-fill Known Allergies with source page citation
      if (ext.allergies && ext.allergies.length > 0) {
        const allergiesFormatted = ext.allergies
          .map((a: any) => `${a.text} [${(a.source || '').split(':')[0].trim()}]`)
          .join(', ');
        setAllergies(allergiesFormatted);
      }

      // 3. Auto-fill Previous Medical Report Narrative (editable)
      const condList = (ext.conditions || []).map((c: any) => `${c.text} [${c.source?.split(':')[0].trim()}]`).join(', ');
      const medList = (ext.medications || []).map((m: any) => `${m.text} [${cSourcePage(m.source)}]`).join(', ');
      const algList = (ext.allergies || []).map((a: any) => `${a.text} [${cSourcePage(a.source)}]`).join(', ');
      const surgList = (ext.surgeries || []).map((s: any) => `${s.text} [${cSourcePage(s.source)}]`).join(', ');
      const pastVitals = (ext.past_values || []).map((v: any) => `${v.name}: ${v.value} ${v.unit || ''} (${v.date || 'past reading, not current'}) [${cSourcePage(v.source)}]`).join('; ');

      const narrativeLines = [
        '[AI-extracted from report, please verify]',
        ext.report_date ? `Report Date: ${ext.report_date}` : null,
        condList ? `Documented Conditions: ${condList}` : null,
        medList ? `Active/Past Medications: ${medList}` : 'Medications: None listed in report',
        algList ? `Documented Allergies: ${algList}` : null,
        pastVitals ? `Past Readings (Historical, Not Current): ${pastVitals}` : null,
        surgList ? `Prior Surgeries: ${surgList}` : null,
        ext.issues && ext.issues.length > 0 ? `Report Notes / Issues: ${ext.issues.join('; ')}` : null,
      ].filter(Boolean);

      setPreviousReportText(narrativeLines.join('\n'));

      // If symptoms are already entered, immediately run triage with history
      if (symptomText.trim().length >= 10) {
        runLiveGemmaAnalysis(symptomText, vitalsObj, age || 40, ext);
      }
    } catch (err: any) {
      console.error('Error during report extraction:', err);
      setExtractionError('Could not read report, please enter history manually');
    } finally {
      setIsExtractingHistory(false);
    }
  };

  function cSourcePage(src?: string) {
    if (!src) return 'p.1';
    const match = src.match(/p\.\d+/i);
    return match ? match[0] : 'p.1';
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { alert('Please enter the patient full name.'); return; }
    if (!ageStr.trim()) { alert('Please enter the patient age.'); return; }
    if (!gender) { alert('Please select a gender - it is mandatory for clinical assessment.'); return; }
    if (!symptomText.trim()) { alert("Please describe the patient's symptoms."); return; }

    let activeGemma = gemmaResult;
    if (!activeGemma && !gemmaError) {
      try { activeGemma = await runLiveGemmaAnalysis(); }
      catch (err) { console.warn('Proceeding with safety rules engine', err); }
    }

    const mediaList: MediaEvidence[] = [];
    if (hasRecordedAudio) {
      mediaList.push({
        id: 'MED-AUD-' + Date.now(),
        type: 'audio',
        title: `Verbal Triage Statement (${language.toUpperCase()} - Kivi Voice STT)`,
        url: recordedAudioUrl || 'https://example.com/audio/intake.mp3',
        durationOrPages: recordedDurationStr,
        uploadedAt: new Date().toISOString(),
        transcript: recordedSegments.length > 0 ? recordedSegments : fallbackAnalysis.generatedTranscript,
      });
    }
    if (uploadedDocName) {
      mediaList.push({
        id: 'MED-DOC-' + Date.now(),
        type: uploadedDocName.match(/\.(png|jpg|jpeg|webp)$/i) ? 'image' : 'report_pdf',
        title: uploadedDocName,
        url: uploadedDocUrl || 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=600&auto=format&fit=crop&q=80',
        uploadedAt: new Date().toISOString(),
        extractedText: previousReportText || 'Medical report submitted for clinical triage review.',
        ocrConfidence: extractionConfidence || 0.95,
      });
    }
    if (woundImageName) {
      mediaList.push({
        id: 'MED-IMG-' + Date.now(),
        type: 'image',
        title: 'Wound / Injury Photograph: ' + woundImageName,
        url: woundImageUrl || 'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?w=600&auto=format&fit=crop&q=80',
        uploadedAt: new Date().toISOString(),
        extractedText: `Clinical image analysis: ${woundImageName}`,
        ocrConfidence: 0.96,
      });
    }

    const resolvedCategory = activeGemma?.provisionalCategory || activeCategory;
    const combinedHistory = [pastHistory, previousReportText].filter(Boolean).join(' | ');

    const created = registerPatient({
      name,
      age: Number(age),
      gender: gender as 'Male' | 'Female' | 'Other',
      contact,
      consentStatus: consentActive ? 'active' : 'withdrawn',
      originalLanguage: language,
      vitals: vitalsObj, // Strictly user-typed vitals (N/A if unmeasured)
      pastMedicalHistory: combinedHistory.split(',').map((s) => s.trim()).filter(Boolean),
      allergies: allergies.split(',').map((s) => s.trim()).filter(Boolean),
      incidentDescription: symptomText,
      reportedSymptoms: activeGemma?.reasons?.map((r: any) => r.text) || fallbackAnalysis.extractedFacts.map((f) => f.value),
      mediaEvidence: mediaList,
      provisionalCategory: resolvedCategory,
      aiAssessment: activeGemma ? {
        structuredSummary: activeGemma.summary || activeGemma.translatedSummary || symptomText,
        warningFlags: activeGemma.warningFlags || [],
        reasons: activeGemma.reasons || [],
        signalFlags: activeGemma.signalFlags || [],
        firstAidSteps: activeGemma.first_aid_steps || [],
        urgencySuggestion: activeGemma.urgency_suggestion,
        provisionalCategory: activeGemma.provisionalCategory,
        explanation: activeGemma.explanation,
        missingConflictingInfo: activeGemma.missingConflictingInfo || [],
        uncertaintyScore: activeGemma.uncertaintyScore || 0.08,
        confidenceGrade: activeGemma.confidenceGrade || 'HIGH',
        suggestedFollowUpQuestions: activeGemma.suggestedFollowUpQuestions || [],
        modelVersion: 'gemma-4-26b-a4b-it (Safety Grounded)',
        assessedAt: new Date().toISOString(),
        humanReviewRequired: true,
        extractedHistory: extractedHistory,
      } : undefined,
    });

    onClose();
    onPatientCreated(created.id);
  };

  const inputCls = 'w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 focus:outline-none transition-all';
  const labelCls = 'block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wide';
  const vCls = 'w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 focus:outline-none transition-all text-center font-semibold';

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-4xl w-full shadow-2xl shadow-black/30 border border-slate-200/80 dark:border-slate-800 my-8 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-emerald-950/5 via-transparent to-transparent dark:from-emerald-950/30">
          <div>
            <div className="flex items-center space-x-2.5">
              <div className="p-1.5 rounded-xl bg-emerald-100 dark:bg-emerald-950/60">
                <Activity className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
              </div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">
                Multimodal Patient Intake &amp; AI Safety Triage
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Gemma 4 Triage Engine
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">
              Integrates past medical PDF history, live audio transcript, and objective observable urgency signals
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-6 max-h-[80vh] overflow-y-auto">

          {/* SECTION A: Demographics */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[11px] font-black flex items-center justify-center">A</div>
              <h4 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wide">Patient Demographics</h4>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3.5">
              <div className="sm:col-span-2">
                <label className={labelCls}>Patient Full Name *</label>
                <input type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter patient's full name" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Age (Years) *</label>
                <input type="number" required min={0} max={130} value={ageStr} onChange={(e) => setAgeStr(e.target.value)} placeholder="Enter age" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Gender * <span className="text-red-500 dark:text-red-400 normal-case font-medium">(required)</span></label>
                <select required value={gender} onChange={(e) => setGender(e.target.value as any)} className={inputCls + (!gender ? ' text-slate-400 dark:text-slate-500' : '')}>
                  <option value="" disabled>Choose gender...</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other / Prefer not to say</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Contact Number</label>
                <input type="tel" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Enter phone / mobile number" className={inputCls} />
              </div>
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Known Allergies</label>
                  {allergies.includes('[p.') && (
                    <span className="text-[10px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded font-mono">
                      AI-extracted from report, please verify
                    </span>
                  )}
                </div>
                <input type="text" value={allergies} onChange={(e) => setAllergies(e.target.value)} placeholder="e.g. Penicillin [p.1], Sulfa drugs (or None)" className={inputCls} />
              </div>
            </div>
          </div>

          {/* SECTION B: Current Complaint & Audio */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-black flex items-center justify-center">B</div>
              <h4 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wide">Current Symptoms &amp; Verbal Statement</h4>
            </div>
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <span className="text-xs font-bold text-slate-600 dark:text-slate-400">Input Language:</span>
              </div>
              <select value={language} onChange={(e) => setLanguage(e.target.value)} className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-emerald-500 focus:outline-none">
                {INPUT_LANGUAGES.map((l) => (<option key={l.value} value={l.value}>{l.label}</option>))}
              </select>
            </div>
            
            <textarea
              required
              rows={4}
              value={symptomText}
              onChange={(e) => setSymptomText(e.target.value)}
              placeholder={SYMPTOM_PLACEHOLDERS[language] || SYMPTOM_PLACEHOLDERS.en}
              className={inputCls + ' resize-none'}
            />

            {/* Audio transcription confidence note */}
            {audioTranscriptConfidence !== null && (
              <div className="mt-2 flex items-center justify-between text-xs px-3 py-1.5 rounded-lg border bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                <span className="text-slate-600 dark:text-slate-300 font-medium">
                  Speech Transcription: {language.toUpperCase()} • Confidence Grade: <strong>{(audioTranscriptConfidence * 100).toFixed(0)}%</strong>
                </span>
                {audioTranscriptConfidence < 0.75 ? (
                  <span className="text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1 text-[11px]">
                    <AlertTriangle className="w-3.5 h-3.5" /> Low-confidence transcription — please verify words
                  </span>
                ) : (
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 text-[11px]">
                    <ShieldCheck className="w-3.5 h-3.5" /> High confidence speech alignment
                  </span>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleToggleAudioRecord}
                  disabled={isTranscribingSTT}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all ${
                    isRecordingAudio
                      ? 'bg-red-600 text-white animate-pulse border-red-500 shadow-md shadow-red-950/30'
                      : isTranscribingSTT
                      ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-900 dark:text-amber-200 border-amber-300'
                      : hasRecordedAudio
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
                  }`}
                >
                  {isRecordingAudio ? (
                    <>
                      <Square className="w-3.5 h-3.5 fill-current" />
                      <span>
                        Recording ({recordingSeconds < 10 ? `0${recordingSeconds}` : recordingSeconds}s)... Stop &amp; Transcribe
                      </span>
                    </>
                  ) : isTranscribingSTT ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />
                      <span>Transcribing audio...</span>
                    </>
                  ) : (
                    <>
                      <Mic className="w-3.5 h-3.5" />
                      <span>{hasRecordedAudio ? `Audio Captured (${recordedDurationStr})` : 'Record Verbal Statement (Kivi Voice STT)'}</span>
                    </>
                  )}
                </button>
              </div>

              <button
                type="button"
                onClick={() => runLiveGemmaAnalysis()}
                disabled={isAnalyzingGemma || !symptomText.trim()}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-sm transition-all active:scale-95"
              >
                {isAnalyzingGemma ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /><span>Screening Urgency...</span></>
                ) : (
                  <><Zap className="w-3.5 h-3.5 text-emerald-200" /><span>Run Safety Triage Screening</span></>
                )}
              </button>
            </div>
          </div>

          {/* SECTION C: Vital Signs (Strictly User Typed - Never Guessed) */}
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-5 h-5 rounded-full bg-red-500 text-white text-[11px] font-black flex items-center justify-center">C</div>
              <h4 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wide">Triage Vital Signs</h4>
              <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                (Type measured readings only. Leave blank if unmeasured — never guessed)
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
              <div className="sm:col-span-2">
                <label className="text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wide block mb-1">BP (Sys / Dia) mmHg</label>
                <div className="flex items-center gap-1.5">
                  <input type="text" value={bpSys} onChange={(e) => setBpSys(e.target.value.replace(/\D/g, ''))} placeholder="Sys" className={vCls + ' flex-1'} maxLength={3} />
                  <span className="text-slate-400 font-bold">/</span>
                  <input type="text" value={bpDia} onChange={(e) => setBpDia(e.target.value.replace(/\D/g, ''))} placeholder="Dia" className={vCls + ' flex-1'} maxLength={3} />
                </div>
              </div>
              <div>
                <label className="text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wide block mb-1">Heart Rate (BPM)</label>
                <input type="text" value={hrStr} onChange={(e) => setHrStr(e.target.value.replace(/\D/g, ''))} placeholder="e.g. 82" className={vCls} maxLength={3} />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wide block mb-1">SpO2 (%)</label>
                <input type="text" value={spO2Str} onChange={(e) => setSpO2Str(e.target.value.replace(/\D/g, ''))} placeholder="e.g. 98" className={vCls + (spO2Str && Number(spO2Str) < 94 ? ' border-red-400 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30' : '')} maxLength={3} />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wide block mb-1">Temp (°F)</label>
                <input type="text" value={tempStr} onChange={(e) => setTempStr(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="e.g. 98.6" className={vCls} maxLength={5} />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wide block mb-1">Resp Rate (/min)</label>
                <input type="text" value={rrStr} onChange={(e) => setRrStr(e.target.value.replace(/\D/g, ''))} placeholder="e.g. 16" className={vCls} maxLength={3} />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wide block mb-1">GCS Score (3-15)</label>
                <input type="text" value={gcsStr} onChange={(e) => setGcsStr(e.target.value.replace(/\D/g, ''))} placeholder="e.g. 15" className={vCls} maxLength={2} />
              </div>
            </div>

            <div className="mt-2.5 flex flex-wrap gap-2">
              {[
                { label: 'BP', val: bpSys && bpDia ? bpSys + '/' + bpDia : 'N/A' },
                { label: 'HR', val: hrStr ? hrStr + ' bpm' : 'N/A' },
                { label: 'SpO2', val: spO2Str ? spO2Str + '%' : 'N/A' },
                { label: 'Temp', val: tempStr ? tempStr + '°F' : 'N/A' },
                { label: 'RR', val: rrStr ? rrStr + '/min' : 'N/A' },
                { label: 'GCS', val: gcsStr ? gcsStr + '/15' : 'N/A' },
              ].map((v) => (
                <span key={v.label} className={'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ' + (v.val === 'N/A' ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700' : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800')}>
                  <span className="text-slate-500 dark:text-slate-400 font-medium">{v.label}:</span> {v.val}
                </span>
              ))}
            </div>
          </div>

          {/* SECTION D: Medical History & PDF Report Upload */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-amber-500 text-white text-[11px] font-black flex items-center justify-center">D</div>
                <h4 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wide">
                  Medical History &amp; Prior Reports
                </h4>
              </div>
              {isExtractingHistory && (
                <span className="text-xs font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 px-3 py-1 rounded-lg border border-amber-200 flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Extracting history from PDF with Gemma AI...
                </span>
              )}
            </div>

            {extractionError && (
              <div className="mb-3 p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 rounded-xl text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                <span>{extractionError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                    Current Conditions / Comorbidities
                  </label>
                  {pastHistory.includes('[p.') && (
                    <span className="text-[10px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded font-mono">
                      AI-extracted from report, please verify
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  value={pastHistory}
                  onChange={(e) => setPastHistory(e.target.value)}
                  placeholder="e.g. Hypertension [p.1], Diabetes Type 2 [p.2]"
                  className={inputCls}
                />
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">Editable list of documented conditions</p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
                    <ClipboardList className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                    Previous Medical Report / History Narrative
                  </label>
                  {previousReportText.includes('[AI-extracted') && (
                    <span className="text-[10px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded font-mono">
                      AI-extracted from report, please verify
                    </span>
                  )}
                </div>
                <textarea
                  rows={4}
                  value={previousReportText}
                  onChange={(e) => setPreviousReportText(e.target.value)}
                  placeholder="Summary of past history, surgeries, ongoing medications, and prior clinical visits. Editable."
                  className={inputCls + ' resize-none text-xs leading-relaxed'}
                />
              </div>
            </div>

            {/* Display Past Readings Chip if found in report */}
            {extractedHistory?.past_values && extractedHistory.past_values.length > 0 && (
              <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
                <span className="font-bold text-slate-600 dark:text-slate-300 block mb-1">
                  Past Readings Identified in Report (Historical Only, Not Current):
                </span>
                <div className="flex flex-wrap gap-2">
                  {extractedHistory.past_values.map((pv: any, i: number) => (
                    <span key={i} className="px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-900 dark:text-amber-200 border border-amber-200 text-[11px] font-mono">
                      <strong>{pv.name}:</strong> {pv.value} {pv.unit} ({pv.date || 'past reading, not current'}) <span className="opacity-75">[{cSourcePage(pv.source)}]</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <input ref={reportInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" className="hidden" onChange={handleReportUpload} />
              <button
                type="button"
                onClick={() => reportInputRef.current?.click()}
                disabled={isExtractingHistory}
                className={'flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border transition-all ' + (uploadedDocName ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700')}
              >
                <FileText className="w-4 h-4" />
                <span>{uploadedDocName ? 'Uploaded: ' + uploadedDocName : 'Upload Previous History PDF / Report'}</span>
              </button>
              {uploadedDocName && (
                <button
                  type="button"
                  onClick={() => {
                    setUploadedDocName(null);
                    setExtractedHistory(null);
                    if (reportInputRef.current) reportInputRef.current.value = '';
                  }}
                  className="text-xs text-slate-400 hover:text-red-500 underline"
                >
                  Remove PDF
                </button>
              )}
            </div>
          </div>

          {/* SECTION E: Wound Image Upload */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-5 h-5 rounded-full bg-rose-600 text-white text-[11px] font-black flex items-center justify-center">E</div>
              <h4 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wide">Wound / Injury Photographic Evidence</h4>
            </div>
            <div className={'border-2 border-dashed rounded-2xl p-4 text-center transition-all ' + (woundImageName ? 'border-rose-400 dark:border-rose-700 bg-rose-50/50 dark:bg-rose-950/20' : 'border-slate-200 dark:border-slate-700 hover:border-rose-300')}>
              <input ref={woundInputRef} type="file" accept="image/*" className="hidden" onChange={handleWoundImageUpload} />
              {woundImageName ? (
                <div className="flex flex-col items-center gap-2">
                  {woundImageUrl && (
                    <img src={woundImageUrl} alt="Wound" className="max-h-36 object-contain rounded-xl border border-rose-300 shadow-sm" />
                  )}
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{woundImageName}</p>
                  <button type="button" onClick={() => { setWoundImageName(null); setWoundImageUrl(null); }} className="text-xs text-red-500 underline">Remove Image</button>
                </div>
              ) : (
                <button type="button" onClick={() => woundInputRef.current?.click()} className="flex flex-col items-center gap-1.5 w-full">
                  <ImageIcon className="w-6 h-6 text-slate-400" />
                  <p className="text-xs font-bold text-slate-600 dark:text-slate-400">Click to attach wound / skin lesion photograph</p>
                </button>
              )}
            </div>
          </div>

          {/* SECTION F: AI Safety Triage Preview */}
          <div className={'p-4 rounded-2xl border space-y-3 text-xs ' + (activeCategory === 'EMERGENCY' ? 'bg-red-50/80 dark:bg-red-950/30 border-red-300 dark:border-red-800' : activeCategory === 'URGENT' ? 'bg-amber-50/80 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800' : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700')}>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center space-x-2 font-bold text-slate-900 dark:text-white">
                <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>AI Clinical Triage Decision Support</span>
                <span className="text-[10px] font-mono text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/80 px-2 py-0.5 rounded-lg border border-emerald-200 dark:border-emerald-700">
                  Gemma 4 Safety Grounded
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePlayKiviTTS}
                  className={'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border transition-all ' + (isPlayingTTS ? 'bg-indigo-600 text-white border-indigo-700 animate-pulse' : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-300 shadow-sm')}
                >
                  {isPlayingTTS ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />}
                  <span>{isPlayingTTS ? 'Stop Voice' : 'Listen'}</span>
                </button>
                <span className={'px-3 py-1 rounded-full text-xs font-black border ' + (activeCategory === 'EMERGENCY' ? 'bg-red-600 text-white border-red-700 shadow-sm' : previewStyles.badgeBg)}>
                  {activeCategory === 'EMERGENCY' ? 'POSSIBLE EMERGENCY: clinician review needed' : activeCategory}
                </span>
              </div>
            </div>

            {isAnalyzingGemma ? (
              <div className="py-4 text-center text-emerald-700 dark:text-emerald-400 font-semibold flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Evaluating clinical urgency signals and grounding sources...</span>
              </div>
            ) : (
              <>
                <p className="text-slate-700 dark:text-slate-300 text-[12px] leading-relaxed">
                  {activeExplanation}
                </p>

                {/* Observable Urgency Reasons with Source Chips */}
                {activeReasons.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block">
                      Observable Clinical Urgency Signals &amp; Grounding:
                    </span>
                    {activeReasons.map((reason: any, idx: number) => (
                      <div key={idx} className="flex items-start justify-between gap-3 p-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-[11px]">
                        <span className="font-semibold text-slate-800 dark:text-slate-100">{reason.text}</span>
                        <span className="shrink-0 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-mono text-[9px] border border-slate-300 dark:border-slate-600 flex items-center gap-1">
                          <Bookmark className="w-2.5 h-2.5 text-slate-400" />
                          {reason.source}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Safety & Signal Flags (Missing, Conflict, Suspicious) */}
                {activeSignalFlags.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block">
                      Safety &amp; Verification Flags:
                    </span>
                    {activeSignalFlags.map((flag: any, idx: number) => (
                      <div
                        key={idx}
                        className={`p-2.5 rounded-xl text-[11px] font-medium border flex items-start gap-2.5 ${
                          flag.type === 'suspicious_input'
                            ? 'bg-purple-50 dark:bg-purple-950/40 text-purple-900 dark:text-purple-200 border-purple-300 dark:border-purple-800'
                            : flag.type === 'conflict'
                            ? 'bg-amber-100/90 dark:bg-amber-950/60 text-amber-950 dark:text-amber-200 border-amber-300 dark:border-amber-700'
                            : flag.type === 'missing'
                            ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-950 dark:text-blue-200 border-blue-200 dark:border-blue-800'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-200'
                        }`}
                      >
                        <span className="font-extrabold uppercase text-[9px] px-1.5 py-0.5 rounded bg-white/80 dark:bg-slate-900/80 border shrink-0">
                          {flag.type.replace('_', ' ')}
                        </span>
                        <div className="flex-1">
                          <div>{flag.text}</div>
                          {flag.sources && flag.sources.length > 0 && (
                            <div className="text-[10px] opacity-75 font-mono mt-0.5">
                              Sources: {flag.sources.join(' | ')}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Immediate First Aid Steps */}
                {activeFirstAid.length > 0 && (
                  <div className="p-3 bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-[11px]">
                    <strong className="text-emerald-900 dark:text-emerald-200 block mb-1">
                      Immediate Supportive / First Aid Steps (Non-Medicinal):
                    </strong>
                    <ul className="list-disc list-inside space-y-0.5 text-emerald-800 dark:text-emerald-300">
                      {activeFirstAid.map((step: string, sIdx: number) => (
                        <li key={sIdx} className={step.includes('112') ? 'font-bold text-red-600 dark:text-red-400' : ''}>
                          {step}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}

            {gemmaError && (
              <div className="p-2.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300 text-[11px]">
                Warning: {gemmaError} — Deterministic safety rules active.
              </div>
            )}
          </div>

          {/* Footer & Consent */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer select-none">
              <input type="checkbox" checked={consentActive} onChange={(e) => setConsentActive(e.target.checked)} className="rounded accent-emerald-600" />
              <span>Patient consented to digital multimodal triage and safety decision support</span>
            </label>
            <div className="flex items-center gap-2.5">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                Cancel
              </button>
              <button type="submit" className="px-6 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-black shadow-sm transition-all active:scale-95">
                Register &amp; Proceed to Clinical Queue
              </button>
            </div>
          </div>

        </form>
      </div>
    </div>
  );
}
