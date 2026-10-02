import { useEffect, useRef, useState } from 'react';

type Recognition = {
  lang: string; interimResults: boolean; continuous: boolean;
  start(): void; stop(): void; abort(): void;
  onstart: (() => void) | null; onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onresult: ((event: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
};
type RecognitionConstructor = new () => Recognition;
const constructor = () => {
  const browser = window as typeof window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return browser.SpeechRecognition || browser.webkitSpeechRecognition;
};
let stopActive: (() => void) | null = null;
export function stopActiveSpeech() { stopActive?.(); }

export function useSpeechInput(onFinal: (text: string) => void) {
  const [status, setStatus] = useState<'idle'|'requesting'|'listening'>('idle');
  const [message, setMessage] = useState('');
  const callback = useRef(onFinal);
  const current = useRef<Recognition | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  useEffect(() => { callback.current = onFinal; }, [onFinal]);
  useEffect(() => () => { cancelRef.current?.(); }, []);
  const supported = Boolean(constructor());
  const cancel = () => { cancelRef.current?.(); };
  const toggle = () => {
    if (current.current) { if (status === 'requesting') cancel(); else current.current.stop(); return; }
    const Ctor = constructor();
    if (!Ctor) { setMessage('Tu navegador no permite dictar. Puedes escribir tu solicitud.'); return; }
    stopActiveSpeech();
    window.speechSynthesis?.cancel();
    const recognition = new Ctor();
    current.current = recognition;
    let transcript = '', failed = false;
    const clearTimer = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
    const release = () => {
      clearTimer();
      recognition.onstart = recognition.onend = recognition.onerror = recognition.onresult = null;
      if (current.current === recognition) current.current = null;
      if (stopActive === abort) stopActive = null;
      cancelRef.current = null;
      setStatus('idle');
    };
    const abort = () => { release(); try { recognition.abort(); } catch { /* already stopped */ } };
    cancelRef.current = abort;
    stopActive = abort;
    recognition.lang = 'es-PE'; recognition.interimResults = true; recognition.continuous = false;
    recognition.onstart = () => { clearTimer(); setStatus('listening'); setMessage('Escuchando… habla ahora.'); };
    recognition.onresult = event => {
      let interim = ''; transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) transcript += `${result[0].transcript} `;
        else interim += result[0].transcript;
      }
      setMessage(interim ? `Te escucho: “${interim}”` : `Dictado: “${transcript.trim()}”`);
    };
    recognition.onerror = event => {
      failed = true;
      const errors: Record<string,string> = {
        'not-allowed': 'El micrófono está bloqueado. Puedes habilitarlo en tu navegador o escribir.',
        'service-not-allowed': 'El servicio de dictado no está disponible. Puedes escribir.',
        'no-speech': 'No detecté voz. Inténtalo de nuevo o escribe.',
        'audio-capture': 'No se pudo acceder al micrófono.',
        'network': 'El servicio de voz no responde. Puedes escribir mientras tanto.',
        'aborted': 'Dictado detenido.',
      };
      setMessage(errors[event.error] || 'No se pudo reconocer la voz. Inténtalo de nuevo.');
      abort();
    };
    recognition.onend = () => {
      release();
      if (!failed && transcript.trim()) callback.current(transcript.trim());
      else if (!failed) setMessage('No detecté una frase. Puedes volver a dictar o escribir.');
    };
    setStatus('requesting'); setMessage('Esperando acceso al micrófono…');
    timer.current = setTimeout(() => { abort(); setMessage('No se pudo iniciar el micrófono. Puedes volver a intentarlo o escribir.'); }, 12000);
    try { recognition.start(); } catch { abort(); setMessage('No se pudo iniciar el dictado. Puedes escribir.'); }
  };
  return { supported, status, message, toggle, cancel };
}
