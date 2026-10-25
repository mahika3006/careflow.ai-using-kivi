'use client';

import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  ShieldAlert, 
  Clock, 
  Calendar, 
  Phone, 
  AlertTriangle, 
  FileText, 
  Volume2, 
  Play, 
  Pause, 
  CheckCircle2, 
  Edit3, 
  Sparkles, 
  UserCheck, 
  FileArchive, 
  ExternalLink, 
  Download, 
  Printer,
  XCircle,
  HelpCircle,
  Lock,
  RotateCcw,
  VolumeX,
  LogOut,
  RefreshCcw,
  Archive
} from 'lucide-react';
import { useCareFlow } from '@/lib/store';
import { UrgencyCategory, Patient } from '@/types';
import { getUrgencyStyles, isOverdue } from '@/lib/triage-rules';
import { generatePrintableReportHtml } from '@/lib/reports';
import { speakWithKivi, stopKiviSpeech } from '@/lib/audio/speech-services';
import { UserAvatar } from '@/components/ui/UserAvatar';

interface PatientDetailViewProps {
  patientId: string;
  onBack: () => void;
  onOpenDoctorWorkspace?: (doctorId: string) => void;
}

export function PatientDetailView({ patientId, onBack, onOpenDoctorWorkspace }: PatientDetailViewProps) {
  const { 
    patients, 
    doctors, 
    currentRole, 
    confirmOrOverrideTriage, 
    assignDoctorToPatient, 
    updatePatientConsent,
    updatePatient,
    dischargePatient,
    readmitPatient,
  } = useCareFlow();

  const patient = patients.find((p) => p.id === patientId);

  // Audio Playback simulation state
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioPlaybackSeconds, setAudioPlaybackSeconds] = useState(0);

  // Clinician Override Modal State
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [overrideCategory, setOverrideCategory] = useState<UrgencyCategory>('URGENT');
  const [overrideReason, setOverrideReason] = useState('');
  const [clinicianNameInput, setClinicianNameInput] = useState('Dr. Vikramaditya Rao');

  // Doctor Clinical Verification & Editing states
  const [isEditingClinicalSynthesis, setIsEditingClinicalSynthesis] = useState(false);
  const [editedSynthesisText, setEditedSynthesisText] = useState(patient?.aiAssessment?.structuredSummary || '');
  const [selectedGroundingSource, setSelectedGroundingSource] = useState<string | null>(null);

  // Doctor Assign Modal State
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignDoctorId, setAssignDoctorId] = useState('');

  // Discharge Modal State
  const [showDischargeModal, setShowDischargeModal] = useState(false);
  const [dischargeNotes, setDischargeNotes] = useState('');

  // Readmit Modal State
  const [showReadmitModal, setShowReadmitModal] = useState(false);
  const [readmitReason, setReadmitReason] = useState('');

  // Kivi Voice Neural TTS states
  const [isPlayingTriageTTS, setIsPlayingTriageTTS] = useState(false);
  const [isPlayingRxTTS, setIsPlayingRxTTS] = useState(false);

  const handlePlayTriageTTS = () => {
    if (isPlayingTriageTTS) {
      stopKiviSpeech();
      setIsPlayingTriageTTS(false);
      return;
    }
    const flags = patient?.aiAssessment?.warningFlags?.map((f) => `${f.flag}: ${f.evidence}`).join('. ') || '';
    const textToSpeak = `Patient ${patient?.name || ''}, ${patient?.age || ''} years old. Triage category: ${effectiveCategory}. ${patient?.aiAssessment?.structuredSummary || ''}. Warning flags: ${flags}`;
    speakWithKivi(textToSpeak, {
      language: patient?.originalLanguage || 'en',
      voice: 'priya',
      onStart: () => setIsPlayingTriageTTS(true),
      onEnd: () => setIsPlayingTriageTTS(false),
      onError: () => setIsPlayingTriageTTS(false),
    });
  };

  const handlePlayPrescriptionTTS = () => {
    if (isPlayingRxTTS) {
      stopKiviSpeech();
      setIsPlayingRxTTS(false);
      return;
    }
    const rxs = patient?.consultation?.prescriptions?.map((rx) => `${rx.drugName}, ${rx.dosage}, ${rx.frequency}. Instructions: ${rx.instructions}`).join('. ') || 'No medications prescribed';
    const notes = patient?.consultation?.clinicalAssessment || '';
    const textToSpeak = `Doctor consultation instructions for ${patient?.name || ''}. Assessment: ${notes}. Prescriptions: ${rxs}`;
    speakWithKivi(textToSpeak, {
      language: patient?.originalLanguage || 'en',
      voice: 'priya',
      onStart: () => setIsPlayingRxTTS(true),
      onEnd: () => setIsPlayingRxTTS(false),
      onError: () => setIsPlayingRxTTS(false),
    });
  };

  // Audio simulation timer
  useEffect(() => {
    let interval: any;
    if (isPlayingAudio) {
      interval = setInterval(() => {
        setAudioPlaybackSeconds((prev) => {
          if (prev >= 30) {
            setIsPlayingAudio(false);
            return 0;
          }
          return prev + 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isPlayingAudio]);

  if (!patient) {
    return (
      <div className="p-10 text-center">
        <p className="text-slate-500 text-sm">Patient record not found.</p>
        <button onClick={onBack} className="mt-4 px-4 py-2 bg-slate-800 text-white rounded text-xs">
          Return to list
        </button>
      </div>
    );
  }

  const effectiveCategory = patient.clinicianConfirmedCategory || patient.provisionalCategory;
  const styles = getUrgencyStyles(effectiveCategory);
  const isOverduePatient = isOverdue(patient);
  const assignedDoctor = doctors.find((d) => d.id === patient.assignedDoctorId);

  const handlePrintReport = () => {
    const html = generatePrintableReportHtml(patient, assignedDoctor);
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
      win.focus();
    }
  };

  const handleSaveOverride = () => {
    if (!overrideReason.trim()) {
      alert('Please enter a clinical justification for changing the triage priority.');
      return;
    }
    confirmOrOverrideTriage(patient.id, overrideCategory, overrideReason, clinicianNameInput);
    setShowOverrideModal(false);
  };

  const handleAssignDoctor = () => {
    if (!assignDoctorId) return;
    assignDoctorToPatient(patient.id, assignDoctorId, currentRole);
    setShowAssignModal(false);
  };

  const handleDirectApprove = () => {
    confirmOrOverrideTriage(
      patient.id,
      patient.provisionalCategory,
      'Attending clinician reviewed and approved AI triage suggestion and assessment.',
      clinicianNameInput
    );
  };

  const handleDischarge = () => {
    if (!dischargeNotes.trim()) {
      alert('Please enter discharge notes or reason before discharging the patient.');
      return;
    }
    dischargePatient(patient.id, clinicianNameInput, dischargeNotes);
    setShowDischargeModal(false);
    setDischargeNotes('');
  };

  const handleReadmit = () => {
    readmitPatient(patient.id, clinicianNameInput, readmitReason || 'Re-admission requested by clinician.');
    setShowReadmitModal(false);
    setReadmitReason('');
  };

  const isDischargedPatient = patient?.status === 'DISCHARGED';

  const handleSaveEditedSynthesis = () => {
    if (!patient.aiAssessment) return;
    const updatedAssessment = {
      ...patient.aiAssessment,
      structuredSummary: editedSynthesisText,
    };
    updatePatient(patient.id, {
      aiAssessment: updatedAssessment,
    });
    setIsEditingClinicalSynthesis(false);
    fetch('/api/audit-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actor: clinicianNameInput,
        role: 'DOCTOR',
        action: 'EDIT_CLINICAL_SYNTHESIS',
        entityType: 'TRIAGE_ASSESSMENT',
        entityId: patient.id,
        notes: 'Clinician edited clinical synthesis notes before sign-off',
      }),
    }).catch((e) => console.warn('Audit error:', e));
  };

  const handleSourceClick = (source: string) => {
    setSelectedGroundingSource(source);
    const reportMedia = patient.mediaEvidence?.find(
      (m) => m.type === 'report_pdf' || (m.type as string) === 'document' || m.title?.toLowerCase().includes('.pdf') || m.title?.toLowerCase().includes('report')
    );
    if (reportMedia?.url) {
      window.open(reportMedia.url, '_blank');
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Action & Navigation Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center space-x-3.5">
          <button
            onClick={onBack}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors shadow-2xs"
            title="Back to Patient List"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <UserAvatar
            name={patient.name}
            src={patient.avatar}
            size="lg"
          />
          <div>
            <div className="flex items-center space-x-2.5 flex-wrap gap-y-1">
              <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                {patient.name}
              </h2>
              <span className="font-mono text-xs text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                {patient.id}
              </span>
              <span className={`px-3 py-1 rounded-full text-xs font-black border ${styles.badgeBg}`}>
                {styles.label}
              </span>
              {patient.clinicianConfirmedCategory && (
                <span className="text-[11px] text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/70 px-2.5 py-1 rounded-full font-bold border border-emerald-300 dark:border-emerald-700 flex items-center gap-1 shadow-2xs">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  Clinician Confirmed
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 font-medium">
              {patient.age} yrs • {patient.gender} • Arrived {new Date(patient.arrivalTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({patient.waitingDurationMinutes} mins in emergency ward)
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">

          {isDischargedPatient ? (
            /* ── DISCHARGED: show Re-admit + Print only ── */
            <>
              {currentRole !== 'PATIENT' && (
                <button
                  onClick={() => { setReadmitReason(''); setShowReadmitModal(true); }}
                  className="flex items-center space-x-2 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white border border-blue-700 rounded-xl text-xs font-bold shadow-xs transition-all active:scale-95"
                >
                  <RefreshCcw className="w-3.5 h-3.5" />
                  <span>Re-admit Patient</span>
                </button>
              )}
              <button
                onClick={handlePrintReport}
                className="flex items-center space-x-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all active:scale-95"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Export Clinical Report</span>
              </button>
            </>
          ) : (
            /* ── ACTIVE: all action buttons ── */
            <>
              {/* Clinician Review / Override Button */}
              {currentRole !== 'PATIENT' && (
                <button
                  onClick={() => {
                    setOverrideCategory(effectiveCategory);
                    setOverrideReason(patient.overrideReason || '');
                    setShowOverrideModal(true);
                  }}
                  className="flex items-center space-x-2 px-3.5 py-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold shadow-xs transition-all active:scale-95"
                >
                  <Edit3 className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                  <span>Review / Override Triage</span>
                </button>
              )}

              {/* Doctor Assignment Button */}
              {currentRole !== 'PATIENT' && (
                <button
                  onClick={() => {
                    setAssignDoctorId(patient.assignedDoctorId || '');
                    setShowAssignModal(true);
                  }}
                  className="flex items-center space-x-2 px-3.5 py-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold shadow-xs transition-all active:scale-95"
                >
                  <UserCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>{patient.assignedDoctorName ? 'Reassign Doctor' : 'Assign Doctor'}</span>
                </button>
              )}

              {/* Discharge Patient Button */}
              {currentRole !== 'PATIENT' && (
                <button
                  onClick={() => { setDischargeNotes(''); setShowDischargeModal(true); }}
                  className="flex items-center space-x-2 px-3.5 py-2 bg-white dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-950/30 text-red-700 dark:text-red-400 border border-red-300 dark:border-red-800 rounded-xl text-xs font-bold shadow-xs transition-all active:scale-95"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Discharge Patient</span>
                </button>
              )}

              {/* Print Clinical Report */}
              <button
                onClick={handlePrintReport}
                className="flex items-center space-x-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all active:scale-95 hover:shadow-emerald-500/20"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Export Clinical Report</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Discharged Patient Historical Record Banner */}
      {isDischargedPatient && (
        <div className="p-4 bg-slate-800 border border-slate-700 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-slate-700 flex items-center justify-center shrink-0">
              <Archive className="w-5 h-5 text-slate-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-white uppercase tracking-widest">Archived Historical Record</span>
                <span className="px-2 py-0.5 bg-slate-600 text-slate-200 rounded text-[10px] font-bold border border-slate-500">READ-ONLY</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                This patient was discharged{patient.dischargedAt ? ` on ${new Date(patient.dischargedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}.
                {patient.dischargeNotes ? ` Discharge note: ${patient.dischargeNotes}` : ''}
                {' '}Clinical data is preserved and read-only. Use "Re-admit Patient" to restore to active care.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* SLA & Waiting Warning Banner — only for active patients */}
      {isOverduePatient && !isDischargedPatient && (
        <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg flex items-center justify-between text-xs text-amber-900">
          <div className="flex items-center space-x-2 font-medium">
            <Clock className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>Priority Escalation Alert:</strong> This patient has waited {patient.waitingDurationMinutes} minutes, exceeding their {patient.slaMinutes}-minute review SLA. Priority has been dynamically elevated in the queue.
            </span>
          </div>
        </div>
      )}

      {/* Grid: Left Column (Demographics, Incident, Evidence) & Right Column (AI Triage, Treatment, Timeline) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: 7 Cols */}
        <div className="lg:col-span-7 space-y-6">
          {/* Section 1: Personal Information & Consent */}
          <div className="bg-white rounded-lg border border-slate-200 shadow-2xs p-5">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                Personal Demographics & Consent
              </h3>
              <div className="flex items-center space-x-2">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                  patient.consentStatus === 'active' 
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                    : 'bg-red-50 text-red-800 border-red-200'
                }`}>
                  Consent: {patient.consentStatus.toUpperCase()}
                </span>
                {currentRole !== 'PATIENT' && (
                  <button
                    onClick={() =>
                      updatePatientConsent(
                        patient.id,
                        patient.consentStatus === 'active' ? 'withdrawn' : 'active',
                        currentRole
                      )
                    }
                    className="text-[10px] text-slate-500 hover:text-slate-800 underline font-medium"
                  >
                    Toggle
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-slate-400 font-medium">Full Legal Name:</span>
                <p className="font-bold text-slate-900 dark:text-white mt-0.5">{patient.name}</p>
              </div>
              <div>
                <span className="text-slate-400 font-medium">Age:</span>
                <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">{patient.age} years ({patient.gender})</p>
              </div>
              <div>
                <span className="text-slate-400 font-medium">Contact Phone:</span>
                <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">{patient.contact}</p>
              </div>
              <div>
                <span className="text-slate-400 font-medium">Emergency Contact:</span>
                <p className="font-semibold text-slate-800 mt-0.5">
                  {patient.emergencyContact?.name} ({patient.emergencyContact?.relationship}) • {patient.emergencyContact?.phone}
                </p>
              </div>
              <div>
                <span className="text-slate-400 font-medium">Past Medical History:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {patient.pastMedicalHistory.length > 0 ? (
                    patient.pastMedicalHistory.map((pmh, i) => (
                      <span key={i} className="px-2 py-0.5 bg-slate-100 rounded text-[11px] text-slate-700">
                        {pmh}
                      </span>
                    ))
                  ) : (
                    <span className="text-slate-500">None reported</span>
                  )}
                </div>
              </div>
              <div>
                <span className="text-slate-400 font-medium">Known Allergies:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {patient.allergies.map((allg, i) => (
                    <span
                      key={i}
                      className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                        allg.toLowerCase().includes('none')
                          ? 'bg-slate-100 text-slate-600'
                          : 'bg-red-50 text-red-700 border border-red-200'
                      }`}
                    >
                      {allg}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Incident & Symptom Information */}
          <div className="bg-white rounded-lg border border-slate-200 shadow-2xs p-5">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide mb-3 pb-2 border-b border-slate-100">
              Reported Symptoms & Baseline Vitals
            </h3>

            {/* Patient original narrative */}
            <div className="bg-slate-50 p-3.5 rounded-md border border-slate-200 text-xs mb-4">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Original Patient Intake Statement ({patient.originalLanguage.toUpperCase()})
              </span>
              <p className="text-slate-800 font-medium leading-relaxed">
                "{patient.incidentDescription}"
              </p>
              {patient.originalTranscriptSnippet && (
                <p className="text-slate-600 text-[11px] italic mt-2 pt-2 border-t border-slate-200">
                  Original wording: "{patient.originalTranscriptSnippet}"
                </p>
              )}
            </div>

            {/* Structured Symptoms */}
            <div className="mb-4">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                Extracted Symptom Profile
              </span>
              <div className="flex flex-wrap gap-1.5">
                {patient.reportedSymptoms.map((sym, i) => (
                  <span
                    key={i}
                    className="px-2.5 py-1 bg-emerald-50 text-emerald-900 border border-emerald-200 rounded-md text-xs font-medium"
                  >
                    • {sym}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3 text-xs text-slate-600 bg-slate-50 p-2.5 rounded border border-slate-200">
                <div>Onset: <strong className="text-slate-800">{patient.symptomOnset}</strong></div>
                <div>Duration: <strong className="text-slate-800">{patient.symptomDuration}</strong></div>
                <div>Progression: <strong className="text-slate-800">{patient.symptomProgression.replace('_', ' ')}</strong></div>
              </div>
            </div>

            {/* Vital Signs Grid */}
            <div>
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                Triage Vitals Check
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs">
                <div className="p-2.5 bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">
                  <span className="text-[10px] text-slate-400 font-bold block">BLOOD PRESSURE</span>
                  <span className="text-sm font-extrabold text-slate-800 dark:text-slate-100 mt-0.5 block">{patient.vitals.bloodPressure || 'N/A'}</span>
                  <span className="text-[9px] text-slate-400">mmHg</span>
                </div>
                <div className="p-2.5 bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">
                  <span className="text-[10px] text-slate-400 font-bold block">HEART RATE</span>
                  <span className="text-sm font-extrabold text-slate-800 dark:text-slate-100 mt-0.5 block">{patient.vitals.heartRate || 'N/A'}</span>
                  <span className="text-[9px] text-slate-400">BPM</span>
                </div>
                <div className="p-2.5 bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">
                  <span className="text-[10px] text-slate-400 font-bold block">OXYGEN SAT (SpO2)</span>
                  <span className={`text-sm font-extrabold mt-0.5 block ${patient.vitals.spO2 && patient.vitals.spO2 !== 'N/A' && Number(patient.vitals.spO2) < 94 ? 'text-red-600 dark:text-red-400' : 'text-slate-800 dark:text-slate-100'}`}>
                    {patient.vitals.spO2 && patient.vitals.spO2 !== 'N/A' ? `${patient.vitals.spO2}%` : 'N/A'}
                  </span>
                  <span className="text-[9px] text-slate-400">Room Air</span>
                </div>
                <div className="p-2.5 bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">
                  <span className="text-[10px] text-slate-400 font-bold block">TEMPERATURE</span>
                  <span className="text-sm font-extrabold text-slate-800 dark:text-slate-100 mt-0.5 block">
                    {patient.vitals.temperature && patient.vitals.temperature !== 'N/A' ? `${patient.vitals.temperature}°F` : 'N/A'}
                  </span>
                  <span className="text-[9px] text-slate-400">Oral probe</span>
                </div>
                <div className="p-2.5 bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">
                  <span className="text-[10px] text-slate-400 font-bold block">RESP RATE</span>
                  <span className="text-sm font-extrabold text-slate-800 dark:text-slate-100 mt-0.5 block">{patient.vitals.respiratoryRate || 'N/A'}</span>
                  <span className="text-[9px] text-slate-400">breaths/min</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Multimodal Evidence (Audio player, ECG, OCR reports) */}
          <div className="bg-white rounded-lg border border-slate-200 shadow-2xs p-5">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                Multimodal Evidence & Grounding
              </h3>
              <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                {patient.mediaEvidence.length} Media Asset{patient.mediaEvidence.length !== 1 ? 's' : ''}
              </span>
            </div>

            {patient.mediaEvidence.length === 0 ? (
              <p className="text-xs text-slate-400 py-3 italic">
                No recorded media uploaded during initial intake.
              </p>
            ) : (
              <div className="space-y-4">
                {patient.mediaEvidence.map((media) => {
                  if (media.type === 'audio') {
                    return (
                      <div key={media.id} className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-2 font-bold text-slate-800">
                            <Volume2 className="w-4 h-4 text-emerald-700" />
                            <span>{media.title}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              Kivi Voice Saaras STT Aligned
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {media.durationOrPages}
                            </span>
                          </div>
                        </div>

                        {/* Interactive Waveform / Play Button */}
                        <div className="flex items-center space-x-3 bg-white p-2.5 rounded border border-slate-200 mb-3">
                          <button
                            onClick={() => setIsPlayingAudio(!isPlayingAudio)}
                            className="w-8 h-8 rounded-full bg-[#0F2E22] text-white flex items-center justify-center hover:bg-[#164232] transition-colors shadow-2xs"
                          >
                            {isPlayingAudio ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                          </button>

                          <div className="flex-1 flex items-center space-x-1 h-7">
                            {[12, 24, 18, 30, 16, 28, 22, 14, 32, 26, 18, 24, 30, 12, 20, 28, 16, 22].map(
                              (height, idx) => (
                                <div
                                  key={idx}
                                  className={`w-1 rounded-full transition-all ${
                                    isPlayingAudio && idx <= audioPlaybackSeconds % 18
                                      ? 'bg-emerald-600'
                                      : 'bg-slate-300'
                                  }`}
                                  style={{ height: `${height}px` }}
                                />
                              )
                            )}
                          </div>

                          <div className="text-[11px] font-mono text-slate-500">
                            00:{audioPlaybackSeconds < 10 ? `0${audioPlaybackSeconds}` : audioPlaybackSeconds} / 00:34
                          </div>
                        </div>

                        {/* Linked Timestamp Transcript */}
                        {media.transcript && (
                          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                            {media.transcript.map((seg, idx) => {
                              const isCurrent =
                                isPlayingAudio &&
                                audioPlaybackSeconds >= seg.seconds &&
                                audioPlaybackSeconds < seg.seconds + 8;

                              return (
                                <div
                                  key={idx}
                                  onClick={() => {
                                    setAudioPlaybackSeconds(seg.seconds);
                                    setIsPlayingAudio(true);
                                  }}
                                  className={`p-2 rounded text-[11px] cursor-pointer transition-colors flex items-start space-x-2 ${
                                    isCurrent
                                      ? 'bg-emerald-100/70 border border-emerald-300'
                                      : seg.highlightUrgent
                                      ? 'bg-red-50/70 border border-red-200'
                                      : 'hover:bg-slate-100'
                                  }`}
                                >
                                  <span className="font-mono text-slate-400 font-bold shrink-0 mt-0.5">
                                    [{seg.timestamp}]
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <span className="font-bold text-slate-800">{seg.speaker}: </span>
                                    <span className={seg.highlightUrgent ? 'font-semibold text-red-900' : 'text-slate-700'}>
                                      {seg.text}
                                    </span>
                                  </div>
                                  <span className="text-[9px] text-slate-400 font-mono shrink-0">
                                    {(seg.confidence * 100).toFixed(0)}%
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  }

                  // Image or PDF Document
                  return (
                    <div key={media.id} className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-2 font-bold text-slate-800">
                          <FileArchive className="w-4 h-4 text-emerald-700" />
                          <span>{media.title}</span>
                        </div>
                        {media.ocrConfidence && (
                          <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-mono font-bold">
                            OCR Confidence: {(media.ocrConfidence * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>

                      {media.url && media.type === 'image' && (
                        <div className="mb-3 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-900/5 dark:bg-slate-950/60 flex items-center justify-center p-2">
                          <img 
                            src={media.url} 
                            alt={media.title} 
                            className="max-h-72 object-contain rounded-lg shadow-sm w-auto mx-auto" 
                          />
                        </div>
                      )}

                      {media.extractedText && (
                        <div className="bg-white p-2.5 rounded border border-slate-200 font-mono text-[11px] text-slate-700 leading-relaxed">
                          <span className="text-[9px] font-bold text-slate-400 block mb-1">OCR EXTRACTED CLINICAL TEXT:</span>
                          {media.extractedText}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: 5 Cols (AI Assessment, Safety Flags, Treatment, Timeline) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Section 4: AI-Assisted Triage Assessment & Human Review Banner */}
          <div className="bg-white rounded-lg border border-slate-200 shadow-2xs p-5">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100 flex-wrap gap-2">
              <div className="flex items-center space-x-1.5">
                <Sparkles className="w-4 h-4 text-emerald-700" />
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                  AI Triage Safety Evaluation
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePlayTriageTTS}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all ${
                    isPlayingTriageTTS
                      ? 'bg-indigo-600 text-white border-indigo-700 animate-pulse'
                      : 'bg-white text-slate-700 border-slate-300 hover:border-indigo-400 shadow-2xs'
                  }`}
                  title="Play audio via Kivi Voice neural TTS"
                >
                  {isPlayingTriageTTS ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5 text-indigo-600" />}
                  <span>{isPlayingTriageTTS ? 'Stop Voice' : 'Listen (Kivi Voice)'}</span>
                </button>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded border font-bold ${
                  patient.aiAssessment?.modelVersion?.toLowerCase().includes('gemma')
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-slate-50 text-slate-500 border-slate-200'
                }`}>
                  {patient.aiAssessment?.modelVersion?.toLowerCase().includes('gemma')
                    ? `⚡ ${patient.aiAssessment.modelVersion}`
                    : '🔒 Safety Rules Engine'}
                </span>
              </div>
            </div>

            {/* Human in the loop prominent notice */}
            <div className="p-2.5 bg-amber-50/80 border border-amber-200 rounded text-[11px] text-amber-900 mb-3 flex items-start space-x-2">
              <HelpCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
              <span>
                <strong>Provisional Assessment:</strong> Generated by algorithm. AI does not diagnose and does not make final decisions. Urgency signals must be reviewed and signed off by clinician.
              </span>
            </div>

            {/* Doctor Approve / Edit / Override Step */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-3 mb-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider block">
                  Doctor Clinical Verification (Required before note finalization)
                </span>
                {patient.clinicianConfirmedCategory ? (
                  <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    Verified ({patient.clinicianConfirmedCategory})
                  </span>
                ) : (
                  <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300">
                    Pending Doctor Sign-Off
                  </span>
                )}
              </div>

              {patient.clinicianConfirmedCategory ? (
                <p className="text-[11px] text-slate-600">
                  Confirmed by <strong>{patient.overrideClinician || 'Attending Clinician'}</strong>. Reason: <em>"{patient.overrideReason || 'Approved AI triage assessment'}"</em>
                </p>
              ) : (
                <p className="text-[11px] text-slate-600">
                  Review the extracted history, unmeasured vitals check, and urgency signals. Clinician confirmation is mandatory.
                </p>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                {!patient.clinicianConfirmedCategory && (
                  <button
                    type="button"
                    onClick={handleDirectApprove}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition-all active:scale-95"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Approve Triage</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setIsEditingClinicalSynthesis(!isEditingClinicalSynthesis)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-2xs transition-all"
                >
                  <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                  <span>{isEditingClinicalSynthesis ? 'Cancel Edit' : 'Edit Assessment'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setOverrideCategory(effectiveCategory);
                    setOverrideReason(patient.overrideReason || '');
                    setShowOverrideModal(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-900 text-white shadow-2xs transition-all active:scale-95"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Override Priority</span>
                </button>
              </div>

              {isEditingClinicalSynthesis && (
                <div className="pt-2 border-t border-slate-200 space-y-2">
                  <textarea
                    value={editedSynthesisText}
                    onChange={(e) => setEditedSynthesisText(e.target.value)}
                    rows={3}
                    className="w-full p-2 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-emerald-600"
                    placeholder="Edit clinical synthesis notes..."
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleSaveEditedSynthesis}
                      className="px-3 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded text-xs font-bold"
                    >
                      Save Synthesis Edits
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Structured Summary */}
            <div className="text-xs text-slate-700 mb-4 bg-slate-50 p-3 rounded border border-slate-200">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Clinical Synthesis & Observable Signals
              </span>
              <p className="font-medium leading-relaxed">{patient.aiAssessment?.structuredSummary}</p>
            </div>

            {/* Grounded Reasons with source chips */}
            {patient.aiAssessment?.reasons && patient.aiAssessment.reasons.length > 0 && (
              <div className="space-y-2 mb-4">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  Grounded Urgency Reasons ({patient.aiAssessment.reasons.length})
                </span>
                <div className="space-y-1.5">
                  {patient.aiAssessment.reasons.map((r, i) => (
                    <div key={i} className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-700 text-xs flex items-start justify-between gap-2">
                      <span className="text-slate-800 dark:text-slate-200 font-medium leading-relaxed">{r.text}</span>
                      <button
                        type="button"
                        onClick={() => handleSourceClick(r.source)}
                        className="inline-flex items-center gap-1 text-[10px] font-mono font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded shrink-0 transition-colors cursor-pointer"
                        title="Click to view grounding source or open report"
                      >
                        <span>{r.source}</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Clinical & Safety Signal Flags */}
            {patient.aiAssessment?.signalFlags && patient.aiAssessment.signalFlags.length > 0 && (
              <div className="space-y-2 mb-4">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  Clinical & Safety Signal Flags ({patient.aiAssessment.signalFlags.length})
                </span>
                <div className="space-y-2">
                  {patient.aiAssessment.signalFlags.map((sf, i) => {
                    let badgeColor = 'bg-amber-50 border-amber-200 text-amber-950';
                    let tagText = 'SIGNAL';
                    if (sf.type === 'missing') {
                      badgeColor = 'bg-amber-50 border-amber-200 text-amber-950';
                      tagText = 'MISSING DATA SIGNAL';
                    } else if (sf.type === 'conflict') {
                      badgeColor = 'bg-purple-50 border-purple-200 text-purple-950';
                      tagText = 'HISTORY CONFLICT SIGNAL';
                    } else if (sf.type === 'suspicious_input') {
                      badgeColor = 'bg-red-50 border-red-200 text-red-950';
                      tagText = 'SUSPICIOUS INPUT SIGNAL';
                    } else if (sf.type === 'low_confidence') {
                      badgeColor = 'bg-orange-50 border-orange-200 text-orange-950';
                      tagText = 'LOW CONFIDENCE SIGNAL';
                    }

                    return (
                      <div key={i} className={`p-2.5 rounded-lg border text-xs ${badgeColor}`}>
                        <div className="flex items-center justify-between font-bold mb-1">
                          <span className="flex items-center gap-1.5">
                            <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                            {tagText}
                          </span>
                        </div>
                        <p className="text-[11px] font-medium leading-relaxed">{sf.text}</p>
                        {sf.sources && sf.sources.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5 pt-1 border-t border-black/5">
                            {sf.sources.map((src, si) => (
                              <button
                                key={si}
                                type="button"
                                onClick={() => handleSourceClick(src)}
                                className="text-[9px] font-mono font-bold bg-white/80 border border-current px-1.5 py-0.2 rounded hover:underline cursor-pointer"
                              >
                                Source: {src}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* First Aid Steps */}
            {patient.aiAssessment?.firstAidSteps && patient.aiAssessment.firstAidSteps.length > 0 && (
              <div className="space-y-2 mb-4 p-3 bg-red-50/50 rounded-lg border border-red-200 text-xs">
                <span className="text-[10px] font-bold text-red-900 uppercase tracking-wider block">
                  First Aid / Stabilization Guidance (Life-Saving Only)
                </span>
                <ol className="list-decimal list-inside space-y-1 text-slate-800 text-[11px] font-medium">
                  {patient.aiAssessment.firstAidSteps.map((step, idx) => (
                    <li key={idx} className={step.includes('112') ? 'font-bold text-red-700' : ''}>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Warning Flags */}
            <div className="space-y-2 mb-4">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                {patient.aiAssessment?.modelVersion?.includes('gemma')
                  ? `⚡ Gemma AI Warning Flags (${patient.aiAssessment?.warningFlags.length || 0})`
                  : `Rule Engine Warning Flags (${patient.aiAssessment?.warningFlags.length || 0})`}
              </span>

              {patient.aiAssessment?.warningFlags.map((flag) => (
                <div
                  key={flag.id}
                  className={`p-2.5 rounded border text-xs ${
                    flag.severity === 'CRITICAL'
                      ? 'bg-red-50 border-red-200 text-red-950'
                      : 'bg-amber-50 border-amber-200 text-amber-950'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold">
                    <span className="flex items-center gap-1.5">
                      <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                      {flag.flag}
                    </span>
                    <span className="text-[9px] uppercase px-1.5 py-0.2 rounded font-extrabold bg-white/80 border border-current">
                      {flag.severity}
                    </span>
                  </div>
                  <p className="text-[11px] mt-1 text-slate-700">
                    {flag.evidence}
                  </p>
                  <div className="text-[10px] text-slate-500 mt-1 font-mono">
                    Grounding: {flag.sourceRef}
                  </div>
                </div>
              ))}
            </div>

            {/* Confidence & Uncertainty */}
            <div className="grid grid-cols-2 gap-2 text-xs mb-4">
              <div className="p-2.5 bg-slate-50 rounded border border-slate-200">
                <span className="text-[10px] text-slate-400 font-bold block">CONFIDENCE GRADE</span>
                <span className="font-extrabold text-emerald-800 block mt-0.5">
                  {patient.aiAssessment?.confidenceGrade}
                </span>
                <span className="text-[9px] text-slate-400 font-mono">
                  Uncertainty: {patient.aiAssessment?.uncertaintyScore}
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded border border-slate-200">
                <span className="text-[10px] text-slate-400 font-bold block">HUMAN REVIEW</span>
                <span className="font-extrabold text-amber-800 block mt-0.5">
                  MANDATORY
                </span>
                <span className="text-[9px] text-slate-400">Per Clinical Protocol</span>
              </div>
            </div>

            {/* Suggested Follow Up Questions */}
            {patient.aiAssessment?.suggestedFollowUpQuestions && (
              <div className="text-xs">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  AI Suggested Clarifying Questions
                </span>
                <ul className="list-disc list-inside space-y-1 text-slate-600 text-[11px]">
                  {patient.aiAssessment.suggestedFollowUpQuestions.map((q, idx) => (
                    <li key={idx} className="leading-snug">{q}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Section 5: Doctor & Treatment Records */}
          <div className="bg-white rounded-lg border border-slate-200 shadow-2xs p-5">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100 flex-wrap gap-2">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                Attending Doctor & Care Records
              </h3>
              <div className="flex items-center gap-2">
                {patient.consultation && (
                  <button
                    type="button"
                    onClick={handlePlayPrescriptionTTS}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all ${
                      isPlayingRxTTS
                        ? 'bg-indigo-600 text-white border-indigo-700 animate-pulse'
                        : 'bg-white text-slate-700 border-slate-300 hover:border-indigo-400 shadow-2xs'
                    }`}
                    title="Listen to prescription & instructions via Kivi Voice"
                  >
                    {isPlayingRxTTS ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5 text-indigo-600" />}
                    <span>{isPlayingRxTTS ? 'Stop Voice' : 'Listen Rx (Kivi Voice)'}</span>
                  </button>
                )}
                {patient.assignedDoctorName && (
                  <span className="text-[11px] font-bold text-emerald-800">
                    {patient.assignedDoctorName}
                  </span>
                )}
              </div>
            </div>

            {patient.consultation ? (
              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-slate-400 font-semibold text-[10px] uppercase">Clinical Assessment</span>
                  <p className="font-bold text-slate-900 mt-0.5">{patient.consultation.clinicalAssessment}</p>
                </div>

                <div>
                  <span className="text-slate-400 font-semibold text-[10px] uppercase">Prescriptions ({patient.consultation.prescriptions.length})</span>
                  <div className="space-y-1.5 mt-1">
                    {patient.consultation.prescriptions.map((rx) => (
                      <div key={rx.id} className="p-2 bg-slate-50 rounded border border-slate-200 flex items-center justify-between">
                        <div>
                          <div className="font-bold text-slate-800">{rx.drugName} • {rx.dosage}</div>
                          <div className="text-[10px] text-slate-500">{rx.frequency} ({rx.route}) - {rx.instructions}</div>
                        </div>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                          rx.approvedByClinician ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {rx.approvedByClinician ? 'APPROVED' : 'DRAFT'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {patient.consultation.referral && (
                  <div className="p-2.5 bg-blue-50 border border-blue-200 rounded text-[11px] text-blue-900">
                    <strong>Referral:</strong> {patient.consultation.referral.specialty} ({patient.consultation.referral.facility})
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-slate-500 py-3 text-center">
                <p>No active consultation note entered yet.</p>
                {patient.assignedDoctorId && onOpenDoctorWorkspace && (
                  <button
                    onClick={() => onOpenDoctorWorkspace(patient.assignedDoctorId!)}
                    className="mt-2 text-xs text-emerald-800 font-bold underline"
                  >
                    Open Doctor Consultation Workspace
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Section 6: Chronological Patient Timeline */}
          <div className="bg-white rounded-lg border border-slate-200 shadow-2xs p-5">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide mb-3 pb-2 border-b border-slate-100">
              Audit & Care Trajectory Timeline
            </h3>

            <div className="space-y-3">
              {patient.timeline.map((event, idx) => (
                <div key={event.id || idx} className="flex items-start space-x-2.5 text-xs">
                  <div className="w-2 h-2 rounded-full bg-emerald-600 mt-1.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900">{event.eventType.replace('_', ' ')}</span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-0.5">{event.description}</p>
                    <span className="text-[10px] text-slate-400">By {event.actor}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Override Triage Modal */}
      {showOverrideModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Edit3 className="w-4 h-4 text-emerald-700" />
                Clinician Triage Confirmation & Override
              </h3>
              <button onClick={() => setShowOverrideModal(false)} className="text-slate-400 hover:text-slate-600">
                <XCircle className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Select Confirmed Urgency Category</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['EMERGENCY', 'URGENT', 'NEEDS_REVIEW', 'ROUTINE'] as UrgencyCategory[]).map((cat) => {
                    const st = getUrgencyStyles(cat);
                    const isSel = overrideCategory === cat;
                    return (
                      <button
                        key={cat}
                        onClick={() => setOverrideCategory(cat)}
                        className={`p-2 rounded border text-left font-bold transition-all ${
                          isSel ? `${st.badgeBg} ring-2 ring-emerald-600` : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Clinical Rationale & Decision Note <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="Enter medical explanation for confirming or overriding AI recommendation..."
                  rows={3}
                  className="w-full p-2.5 border border-slate-200 rounded text-xs focus:ring-1 focus:ring-emerald-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Reviewing Clinician Name</label>
                <input
                  type="text"
                  value={clinicianNameInput}
                  onChange={(e) => setClinicianNameInput(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded text-xs focus:ring-1 focus:ring-emerald-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-200">
              <button
                onClick={() => setShowOverrideModal(false)}
                className="px-3 py-1.5 rounded text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveOverride}
                className="px-4 py-1.5 rounded text-xs font-bold bg-[#0F2E22] hover:bg-[#164232] text-white"
              >
                Sign & Commit Review
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Doctor Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <UserCheck className="w-4 h-4 text-emerald-700" />
                Assign Attending Physician
              </h3>
              <button onClick={() => setShowAssignModal(false)} className="text-slate-400 hover:text-slate-600">
                <XCircle className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto">
              {doctors.map((doc) => {
                const isSelected = assignDoctorId === doc.id;
                const isAtCap = doc.currentCaseload >= doc.maxCapacity;

                return (
                  <div
                    key={doc.id}
                    onClick={() => setAssignDoctorId(doc.id)}
                    className={`p-3 rounded-lg border cursor-pointer transition-all flex items-center justify-between text-xs ${
                      isSelected
                        ? 'border-emerald-600 bg-emerald-50/60 ring-1 ring-emerald-600'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <UserAvatar
                        name={doc.name}
                        src={doc.avatar}
                        size="sm"
                      />
                      <div>
                        <div className="font-bold text-slate-900">{doc.name}</div>
                        <div className="text-[10px] text-slate-500">{doc.specializations[0]} • {doc.languages.join(', ')}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] font-mono font-bold text-slate-700">
                        {doc.currentCaseload}/{doc.maxCapacity} Active
                      </span>
                      {isAtCap && (
                        <div className="text-[9px] text-red-600 font-bold">At Capacity</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-200">
              <button
                onClick={() => setShowAssignModal(false)}
                className="px-3 py-1.5 rounded text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={handleAssignDoctor}
                className="px-4 py-1.5 rounded text-xs font-bold bg-[#0F2E22] hover:bg-[#164232] text-white"
              >
                Confirm Doctor Assignment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Discharge Patient Confirmation Modal */}
      {showDischargeModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <LogOut className="w-4 h-4 text-red-600" />
                Discharge Patient
              </h3>
              <button onClick={() => setShowDischargeModal(false)} className="text-slate-400 hover:text-slate-600">
                <XCircle className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <p className="text-xs text-slate-600 leading-relaxed">
                You are about to formally discharge <strong className="text-slate-900">{patient.name}</strong> from active clinical management.
                The patient record will be archived and remain accessible in the Patient History section.
              </p>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                  Discharge Notes / Clinical Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={dischargeNotes}
                  onChange={(e) => setDischargeNotes(e.target.value)}
                  placeholder="e.g. Patient clinically stable, vitals normalized, discharged home with medication. Follow-up in 2 weeks."
                  rows={4}
                  className="w-full border border-slate-300 rounded-lg p-3 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                  Discharging Clinician
                </label>
                <input
                  value={clinicianNameInput}
                  onChange={(e) => setClinicianNameInput(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-400"
                />
              </div>
            </div>
            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-200">
              <button
                onClick={() => setShowDischargeModal(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDischarge}
                className="px-4 py-1.5 rounded-lg text-xs font-black bg-red-600 hover:bg-red-700 text-white flex items-center gap-1.5 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                Confirm Discharge
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Re-admit Patient Modal */}
      {showReadmitModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <RefreshCcw className="w-4 h-4 text-blue-600" />
                Re-admit Patient to Active Care
              </h3>
              <button onClick={() => setShowReadmitModal(false)} className="text-slate-400 hover:text-slate-600">
                <XCircle className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <p className="text-xs text-slate-600 leading-relaxed">
                You are about to re-admit <strong className="text-slate-900">{patient.name}</strong> to the active clinical queue. 
                The existing patient record will be restored without creating a duplicate entry.
              </p>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                  Reason for Re-admission
                </label>
                <textarea
                  value={readmitReason}
                  onChange={(e) => setReadmitReason(e.target.value)}
                  placeholder="e.g. Worsening symptoms post-discharge, follow-up complication requiring clinical evaluation."
                  rows={3}
                  className="w-full border border-slate-300 rounded-lg p-3 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-200">
              <button
                onClick={() => setShowReadmitModal(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReadmit}
                className="px-4 py-1.5 rounded-lg text-xs font-black bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5 transition-colors"
              >
                <RefreshCcw className="w-3.5 h-3.5" />
                Confirm Re-admission
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Grounding Source Modal */}
      {selectedGroundingSource && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-lg w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-emerald-700" />
                Citation & Evidence Source
              </h3>
              <button onClick={() => setSelectedGroundingSource(null)} className="text-slate-400 hover:text-slate-600">
                <XCircle className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Report Grounding Citation
                </span>
                <p className="font-mono text-xs font-semibold text-indigo-700">
                  {selectedGroundingSource}
                </p>
              </div>
              <p className="text-slate-600 leading-relaxed text-[11px]">
                This reason was extracted directly from verified clinical evidence (uploaded medical report or patient intake). The AI model is strictly grounded to these documented statements.
              </p>
            </div>
            <div className="flex justify-end pt-2 border-t border-slate-200">
              <button
                onClick={() => setSelectedGroundingSource(null)}
                className="px-4 py-1.5 rounded text-xs font-bold bg-slate-800 hover:bg-slate-900 text-white"
              >
                Close Viewer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
