import { useEffect, useRef, useState } from 'react';
import { stopActiveSpeech } from './useSpeechInput';

export function ReadAloud({ text }: { text: string }) {
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState('');
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  useEffect(() => {
    setSpeaking(false);
    return () => {
      if (utterance.current) { utterance.current.onend = null; utterance.current.onerror = null; window.speechSynthesis.cancel(); utterance.current = null; }
    };
  }, [text]);
  const read = () => {
    if (!supported) return;
    stopActiveSpeech();
    if (utterance.current) { utterance.current.onend = null; utterance.current.onerror = null; }
    window.speechSynthesis.cancel();
    if (speaking) { setSpeaking(false); return; }
    const message = new SpeechSynthesisUtterance(text);
    utterance.current = message;
    message.lang = 'es-PE';
    const voices = window.speechSynthesis.getVoices();
    message.voice = voices.find(v => v.lang === 'es-PE') || voices.find(v => v.lang.startsWith('es')) || null;
    message.rate = .95;
    message.onend = () => setSpeaking(false);
    message.onerror = event => { setSpeaking(false); if (event.error !== 'canceled' && event.error !== 'interrupted') setError('No se pudo leer el resumen. Puedes volver a intentarlo.'); };
    setError(''); setSpeaking(true); window.speechSynthesis.speak(message);
  };
  return <div className="read-aloud"><button type="button" className="btn btn-secondary" onClick={read} disabled={!supported} aria-pressed={speaking}>{speaking ? 'Detener lectura' : 'Leer resumen en voz alta'}</button>{!supported && <small>La lectura en voz alta no está disponible en este navegador.</small>}{error && <span role="status">{error}</span>}</div>;
}
