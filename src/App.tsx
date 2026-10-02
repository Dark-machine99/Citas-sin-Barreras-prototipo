import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { createPortal } from 'react-dom';
import { ReadAloud } from './ReadAloud';
import { useSpeechInput, stopActiveSpeech } from './useSpeechInput';
import { bookingDates, bookingTimes, isBookingCommand, parseBooking, validBooking, type BookingDraft } from './booking-language';
import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router';

type FontScale = 'small' | 'normal' | 'large';
type AccessibilityPrefs = {
  fontScale: FontScale;
  highContrast: boolean;
  largeCursor: boolean;
  magnifier: boolean;
  guidedReading: boolean;
  simpleMode: boolean;
  reducedMotion: boolean;
  colorBlind: boolean;
};

type Patient = { name: string; email: string; phone?: string };
type AppointmentStatus = 'pending' | 'confirmed' | 'attended' | 'no_show' | 'cancelled';
type Appointment = {
  id: string;
  code: string;
  specialty: string;
  doctor: string;
  date: string;
  time: string;
  reason?: string;
  status: AppointmentStatus;
};

type Doctor = {
  id: string;
  name: string;
  specialty: string;
  years: number;
  rating: number;
  next: string;
  initials: string;
};

const specialties = [
  { name: 'Medicina general', icon: '✚', desc: 'Evaluación integral y orientación inicial.' },
  { name: 'Cardiología', icon: '♡', desc: 'Atención del corazón y sistema circulatorio.' },
  { name: 'Dermatología', icon: '◌', desc: 'Piel, cabello y uñas.' },
  { name: 'Oftalmología', icon: '◉', desc: 'Salud visual y cuidado de los ojos.' },
  { name: 'Traumatología', icon: '◇', desc: 'Huesos, articulaciones y lesiones.' },
  { name: 'Neurología', icon: '⌁', desc: 'Sistema nervioso, cefaleas y seguimiento.' },
];

const doctors: Doctor[] = [
  { id: 'd1', name: 'Dra. Andrea Ruiz', specialty: 'Medicina general', years: 12, rating: 4.9, next: 'Mañana, 9:00 a. m.', initials: 'AR' },
  { id: 'd2', name: 'Dr. Carlos Mendoza', specialty: 'Cardiología', years: 15, rating: 4.8, next: 'Jueves, 11:30 a. m.', initials: 'CM' },
  { id: 'd3', name: 'Dra. Lucía Torres', specialty: 'Dermatología', years: 9, rating: 4.9, next: 'Hoy, 4:00 p. m.', initials: 'LT' },
  { id: 'd4', name: 'Dr. Mateo Salazar', specialty: 'Oftalmología', years: 11, rating: 4.7, next: 'Viernes, 8:30 a. m.', initials: 'MS' },
  { id: 'd5', name: 'Dra. Elena Paredes', specialty: 'Traumatología', years: 14, rating: 4.8, next: 'Viernes, 2:00 p. m.', initials: 'EP' },
  { id: 'd6', name: 'Dr. José Valdivia', specialty: 'Neurología', years: 13, rating: 4.9, next: 'Lunes, 10:00 a. m.', initials: 'JV' },
];

const defaultPrefs: AccessibilityPrefs = {
  fontScale: 'normal',
  highContrast: false,
  largeCursor: false,
  magnifier: false,
  guidedReading: false,
  simpleMode: false,
  reducedMotion: false,
  colorBlind: false,
};

const initialAppointments: Appointment[] = [
  {
    id: 'a1',
    code: 'CMB-24091',
    specialty: 'Medicina general',
    doctor: 'Dra. Andrea Ruiz',
    date: '2026-10-02',
    time: '09:00',
    reason: 'Control general',
    status: 'confirmed',
  },
];

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function readSessionJSON<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function dateLabel(value: string) {
  const d = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
}

const AccessibilityContext = createContext<{
  prefs: AccessibilityPrefs;
  setPrefs: React.Dispatch<React.SetStateAction<AccessibilityPrefs>>;
  resetPrefs: () => void;
}>({ prefs: defaultPrefs, setPrefs: () => undefined, resetPrefs: () => undefined });

function AccessibilityProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<AccessibilityPrefs>(() => readJSON('cmb:prefs', defaultPrefs));
  const [systemReduced, setSystemReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setSystemReduced(mq.matches);
    sync();
    mq.addEventListener?.('change', sync);
    return () => mq.removeEventListener?.('change', sync);
  }, []);

  useEffect(() => {
    localStorage.setItem('cmb:prefs', JSON.stringify(prefs));
    const root = document.documentElement;
    root.dataset.fontScale = prefs.fontScale;
    root.dataset.highContrast = String(prefs.highContrast);
    root.dataset.largeCursor = String(prefs.largeCursor);
    root.dataset.colorBlind = String(prefs.colorBlind);
    root.dataset.reducedMotion = String(prefs.reducedMotion || systemReduced);
  }, [prefs, systemReduced]);

  return (
    <AccessibilityContext.Provider value={{ prefs, setPrefs, resetPrefs: () => setPrefs(defaultPrefs) }}>
      {children}
      <GuidedReading enabled={prefs.guidedReading} />
      <ReadingMagnifier enabled={prefs.magnifier} />
    </AccessibilityContext.Provider>
  );
}

function useAccessibility() {
  return useContext(AccessibilityContext);
}

function GuidedReading({ enabled }: { enabled: boolean }) {
  const [y, setY] = useState(220);
  useEffect(() => {
    if (!enabled) return;
    const onMove = (e: PointerEvent) => setY(e.clientY);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerdown', onMove);
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerdown', onMove); };
  }, [enabled]);
  if (!enabled) return null;
  return <div className="reading-ruler" style={{ top: y - 26 }} aria-hidden="true" />;
}

function ReadingMagnifier({ enabled }: { enabled: boolean }) {
  const [text, setText] = useState('Toca un texto, mueve el puntero o usa Tab para ampliarlo.');
  useEffect(() => {
    if (!enabled) return;
    const get = (target: EventTarget | null) => {
      const el = target instanceof HTMLElement ? target.closest('button,a,label,h1,h2,h3,p,li,input,textarea') : null;
      if (!el || el.closest('.magnifier-panel') || (el instanceof HTMLInputElement && el.type === 'password')) return;
      const value = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.value || el.placeholder : el.textContent;
      if (value?.trim()) setText(value.trim().slice(0, 180));
    };
    const hover = (e: Event) => get(e.target);
    document.addEventListener('mouseover', hover);
    document.addEventListener('pointerdown', hover);
    document.addEventListener('focusin', hover);
    return () => {
      document.removeEventListener('mouseover', hover);
      document.removeEventListener('pointerdown', hover);
      document.removeEventListener('focusin', hover);
    };
  }, [enabled]);
  if (!enabled) return null;
  return (
    <aside className="magnifier-panel" aria-live="polite" aria-label="Lupa de lectura">
      <span>🔎 Lupa de lectura</span>
      <strong>{text}</strong>
    </aside>
  );
}

const AuthContext = createContext<{
  patient: Patient | null;
  login: (email: string) => void;
  register: (patient: Patient) => void;
  logout: () => void;
}>({ patient: null, login: () => undefined, register: () => undefined, logout: () => undefined });

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [patient, setPatient] = useState<Patient | null>(() => readJSON<Patient | null>('cmb:patient', null));
  const persist = (next: Patient | null) => {
    setPatient(next);
    if (next) localStorage.setItem('cmb:patient', JSON.stringify(next));
    else localStorage.removeItem('cmb:patient');
  };
  return (
    <AuthContext.Provider
      value={{
        patient,
        login: (email) => persist({ name: 'Valeria', email }),
        register: persist,
        logout: () => persist(null),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

function useAuth() {
  return useContext(AuthContext);
}

const AppointmentContext = createContext<{
  appointments: Appointment[];
  addAppointment: (a: Omit<Appointment, 'id' | 'code' | 'status'>) => Appointment;
  cancelAppointment: (id: string) => void;
  rescheduleAppointment: (id: string, date: string, time: string) => void;
}>({ appointments: [], addAppointment: () => initialAppointments[0], cancelAppointment: () => undefined, rescheduleAppointment: () => undefined });

function AppointmentProvider({ children }: { children: React.ReactNode }) {
  const [appointments, setAppointments] = useState<Appointment[]>(() => readJSON('cmb:appointments', initialAppointments));
  useEffect(() => localStorage.setItem('cmb:appointments', JSON.stringify(appointments)), [appointments]);
  const addAppointment = (a: Omit<Appointment, 'id' | 'code' | 'status'>) => {
    const created: Appointment = {
      ...a,
      id: crypto.randomUUID(),
      code: `CMB-${Math.floor(10000 + Math.random() * 89999)}`,
      status: 'pending',
    };
    setAppointments((prev) => [created, ...prev]);
    return created;
  };
  return (
    <AppointmentContext.Provider
      value={{
        appointments,
        addAppointment,
        cancelAppointment: (id) => setAppointments((prev) => prev.map((a) => (a.id === id ? { ...a, status: 'cancelled' } : a))),
        rescheduleAppointment: (id, date, time) => setAppointments((prev) => prev.map((a) => (a.id === id ? { ...a, date, time, status: 'pending' } : a))),
      }}
    >
      {children}
    </AppointmentContext.Provider>
  );
}

function Icon({ name }: { name: 'calendar' | 'doctor' | 'access' | 'profile' | 'home' | 'mic' | 'search' | 'clock' | 'check' | 'heart' | 'menu' | 'x' }) {
  const paths: Record<string, React.ReactNode> = {
    home: <><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-7h6v7"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/><path d="m8 15 2 2 4-4"/></>,
    doctor: <><circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4.2 3.4-6 8-6s7.2 1.8 8 6"/><path d="M18 4v4M16 6h4"/></>,
    access: <><circle cx="12" cy="4" r="2"/><path d="M4 8h16M12 6v6M8 21l4-9 4 9M5 13l7-1 7 1"/></>,
    profile: <><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 3.7-6 8-6s7 2 8 6"/></>,
    mic: <><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    heart: <path d="M20.8 5.8c-2.4-2.4-6.3-1.8-8.8 1-2.5-2.8-6.4-3.4-8.8-1-2.8 2.8-1.8 7 1 9.4L12 22l7.8-6.8c2.8-2.4 3.8-6.6 1-9.4Z"/>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16"/></>,
    x: <><path d="m6 6 12 12M18 6 6 18"/></>,
  };
  return <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

function Button({ children, variant = 'primary', className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  return <button className={`btn btn-${variant} ${className}`} {...props}>{children}</button>;
}

function VoiceInput({ onText, label = 'Dictar por voz' }: { onText: (text: string) => void; label?: string }) {
  const speech = useSpeechInput(onText);
  return <span className="voice-input-wrap"><button type="button" className={`voice-inline ${speech.status === 'listening' ? 'is-listening' : ''}`} onClick={speech.toggle} disabled={!speech.supported} aria-label={speech.status === 'idle' ? label : 'Detener dictado'}><Icon name="mic"/><span>{speech.status === 'requesting' ? 'Cancelar' : speech.status === 'listening' ? 'Detener' : 'Dictar'}</span></button>{speech.message && <span className="voice-feedback" role="status">{speech.message}</span>}{!speech.supported && <span className="sr-only">Dictado no disponible. Puedes escribir.</span>}</span>;
}

function AccessibilityToolbar() {
  const { prefs, setPrefs } = useAccessibility();
  const [open, setOpen] = useState(false);
  return (
    <div className={`a11y-toolbar ${open ? 'open' : ''}`}>
      <button className="a11y-fab" aria-label="Preferencias de accesibilidad" aria-expanded={open} aria-controls="accessibility-panel" onClick={() => setOpen((v) => !v)}>
        <Icon name="access"/><span>Accesibilidad</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.section id="accessibility-panel" className="a11y-panel" initial={{ opacity: 0, y: 12, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: .98 }}>
            <div className="panel-head"><div><span className="eyebrow">Preferencias</span><h2>Adapta la interfaz</h2></div><button className="icon-button" aria-label="Cerrar preferencias" onClick={() => setOpen(false)}><Icon name="x"/></button></div>
            <div className="font-controls" aria-label="Tamaño de texto">
              {(['small','normal','large'] as FontScale[]).map((scale, index) => <button key={scale} className={prefs.fontScale===scale?'active':''} onClick={() => setPrefs((p)=>({...p,fontScale:scale}))}>{['A−','A','A+'][index]}</button>)}
            </div>
            <Toggle label="Alto contraste" checked={prefs.highContrast} onChange={(v)=>setPrefs(p=>({...p,highContrast:v}))}/>
            <Toggle label="Cursor grande" checked={prefs.largeCursor} onChange={(v)=>setPrefs(p=>({...p,largeCursor:v}))}/>
            <Toggle label="Lupa de lectura" checked={prefs.magnifier} onChange={(v)=>setPrefs(p=>({...p,magnifier:v}))}/>
            <Toggle label="Lectura guiada" checked={prefs.guidedReading} onChange={(v)=>setPrefs(p=>({...p,guidedReading:v}))}/>
            <Toggle label="Modo simple" checked={prefs.simpleMode} onChange={(v)=>setPrefs(p=>({...p,simpleMode:v}))}/>
            <Toggle label="Reducir movimiento" checked={prefs.reducedMotion} onChange={(v)=>setPrefs(p=>({...p,reducedMotion:v}))}/>
            <Toggle label="Refuerzo para daltonismo" checked={prefs.colorBlind} onChange={(v)=>setPrefs(p=>({...p,colorBlind:v}))}/>
            <Link className="panel-link" to="/accesibilidad" onClick={() => setOpen(false)}>Configuración completa →</Link>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <label className="toggle-row"><span>{label}</span><input type="checkbox" aria-label={label} checked={checked} onChange={(e)=>onChange(e.target.checked)}/><span className="switch" aria-hidden="true"/></label>;
}

function GlobalVoiceControl() {
  const navigate = useNavigate();
  const { setPrefs } = useAccessibility();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('Puedes decir “ir a mis citas” o “quiero cardiología el viernes en la mañana”.');
  const runCommand = (raw: string) => {
    const text = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    setMessage(`Escuché: “${raw}”`);
    if (isBookingCommand(raw, specialties.map(s => s.name))) {
      sessionStorage.setItem('cmb:conversation', raw);
      setOpen(false);
      navigate('/reservar?conversacion=1', { state: { request: raw, requestId: Date.now() } });
    }
    else if (text.includes('portada') || text.includes('pagina principal')) navigate('/');
    else if (text.includes('iniciar sesion') || text.includes('login')) navigate('/login');
    else if (text.includes('crear cuenta') || text.includes('registro')) navigate('/registro');
    else if (text.includes('recuperar') && text.includes('contrasena')) navigate('/recuperar');
    else if (text.includes('inicio')) navigate('/inicio');
    else if (text.includes('mis citas') || text.includes('citas')) navigate('/citas');
    else if (text.includes('reservar') || text.includes('nueva cita')) navigate('/reservar');
    else if (text.includes('medicos') || text.includes('doctor')) navigate('/medicos');
    else if (text.includes('especialidades')) navigate('/especialidades');
    else if (text.includes('accesibilidad')) navigate('/accesibilidad');
    else if (text.includes('perfil')) navigate('/perfil');
    else if (text.includes('alto contraste') && ((text.split(' ').includes('activar')) || text.includes('encender'))) setPrefs((p)=>({...p,highContrast:true}));
    else if (text.includes('alto contraste') && (text.includes('desactivar') || text.includes('apagar'))) setPrefs((p)=>({...p,highContrast:false}));
    else if (text.includes('texto grande') || text.includes('aumentar texto')) setPrefs((p)=>({...p,fontScale:'large'}));
    else if (text.includes('texto normal')) setPrefs((p)=>({...p,fontScale:'normal'}));
    else if (text.includes('modo simple') && !text.includes('desactivar')) setPrefs((p)=>({...p,simpleMode:true}));
    else if (text.includes('desactivar modo simple')) setPrefs((p)=>({...p,simpleMode:false}));
    else if (text.includes('reducir movimiento')) setPrefs((p)=>({...p,reducedMotion:true}));
    else if (text.includes('lupa')) setPrefs((p)=>({...p,magnifier:true}));
    else setMessage(`No reconocí una acción para “${raw}”. Revisa los comandos sugeridos.`);
  };

  const speech = useSpeechInput(runCommand);
  const close = () => { speech.cancel(); setOpen(false); };
  return <div className="voice-control">
    <button className={`voice-fab ${speech.status === 'listening' ? 'is-listening' : ''}`} onClick={()=>{if(open)close();else setOpen(true)}} aria-label="Control por voz" aria-expanded={open}><Icon name="mic"/><span>Voz</span></button>
    <AnimatePresence>{open && <motion.div className="voice-popover" initial={{opacity:0,y:12,x:'-50%'}} animate={{opacity:1,y:0,x:'-50%'}} exit={{opacity:0,y:8,x:'-50%'}} role="dialog" aria-label="Control por voz" onKeyDown={e=>{if(e.key==='Escape')close()}}>
      <div className="panel-head"><div><span className="eyebrow">Control por voz</span><h2>Habla para navegar</h2></div><button className="icon-button" aria-label="Cerrar control por voz" onClick={close}><Icon name="x"/></button></div>
      <p aria-live="polite">{speech.message || message}</p>
      <div className="voice-chips"><span>“Ir a mis citas”</span><span>“Ir a médicos”</span><span>“Quiero cardiología el viernes en la mañana”</span><span>“Activar alto contraste”</span></div>
      <Button onClick={speech.toggle} disabled={!speech.supported}><Icon name="mic"/>{speech.status === 'requesting' ? 'Cancelar inicio' : speech.status === 'listening' ? 'Detener escucha' : 'Escuchar comando'}</Button>
      {!speech.supported && <p className="form-note">Tu navegador no permite dictar. Puedes escribir la solicitud al reservar.</p>}
      <Link className="panel-link" to="/reservar" onClick={close}>Escribir mi solicitud de cita →</Link>
    </motion.div>}</AnimatePresence>
  </div>;
}

function PublicHeader() {
  return <header className="public-header"><Link to="/" className="brand"><span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" fill="currentColor"/></svg></span><span><strong>Citas sin Barreras</strong><small>Salud accesible</small></span></Link><nav aria-label="Navegación pública"><Link to="/privacidad">Privacidad</Link><Link to="/login">Ingresar</Link><Link className="nav-cta" to="/registro">Crear cuenta</Link></nav></header>;
}

function AppShell({ children }: { children: React.ReactNode }) {
  const { patient, logout } = useAuth();
  const [mobile, setMobile] = useState(false);
  const location = useLocation();
  useEffect(()=>{
    setMobile(false);
    window.scrollTo({top:0,left:0,behavior:'instant'});
  },[location.pathname]);
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">Saltar al contenido principal</a>
      <header className="app-header">
        <Link to="/inicio" className="brand"><span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" fill="currentColor"/></svg></span><span><strong>Citas sin Barreras</strong><small>Portal del paciente</small></span></Link>
        <button className="mobile-menu" aria-label="Abrir menú" aria-expanded={mobile} onClick={()=>setMobile(v=>!v)}><Icon name={mobile?'x':'menu'}/></button>
        <nav className={mobile?'main-nav open':'main-nav'} aria-label="Navegación principal">
          <NavItem to="/inicio" icon="home">Inicio</NavItem>
          <NavItem to="/medicos" icon="doctor">Médicos</NavItem>
          <NavItem to="/citas" icon="calendar">Mis citas</NavItem>
          <NavItem to="/accesibilidad" icon="access">Accesibilidad</NavItem>
          <div className="mobile-account"><NavItem to="/perfil" icon="profile">Mi perfil</NavItem><button className="nav-item mobile-logout" onClick={logout}>Salir</button></div>
        </nav>
        <div className="user-menu"><Link to="/perfil" className="user-chip"><span className="avatar mini">{patient?.name?.slice(0,1) || 'P'}</span><span>{patient?.name || 'Paciente'}</span></Link><button className="link-button" onClick={logout}>Salir</button></div>
      </header>
      <main id="main" tabIndex={-1}>{children}</main>
      <footer className="app-footer"><span>Citas sin Barreras · Salud accesible</span><Link to="/privacidad">Privacidad</Link></footer>
      <AccessibilityToolbar/>
      <GlobalVoiceControl/>
    </div>
  );
}

function NavItem({ to, icon, children }: { to: string; icon: 'home'|'doctor'|'calendar'|'access'|'profile'; children: React.ReactNode }) {
  return <NavLink to={to} className={({isActive})=>isActive?'nav-item active':'nav-item'}><Icon name={icon}/>{children}</NavLink>;
}

function Protected({ children }: { children: React.ReactNode }) {
  const { patient } = useAuth();
  return patient ? <>{children}</> : <Navigate to="/login" replace/>;
}

function Page({ children, className='' }: { children: React.ReactNode; className?: string }) {
  const { prefs } = useAccessibility();
  return <motion.div className={`page ${className}`} initial={prefs.reducedMotion?false:{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{duration:prefs.reducedMotion?0:.22}}>{children}</motion.div>;
}

function Landing() {
  return <div className="public-page"><PublicHeader/><main id="main"><section className="hero"><div className="hero-copy"><span className="pill">● Atención simple, clara y accesible</span><h1>Tu salud, <span>sin barreras.</span></h1><p>Encuentra médicos, agenda una cita y adapta cada pantalla a tus necesidades. Todo desde un solo lugar.</p><div className="hero-actions"><Link className="btn btn-primary" to="/registro">Crear mi cuenta</Link><Link className="btn btn-secondary" to="/login">Ya tengo cuenta</Link></div><div className="trust-row"><div><strong>7→3</strong><span>Pasos adaptables</span></div><div><strong>AA</strong><span>Diseño accesible</span></div><div><strong>🎙</strong><span>Control por voz</span></div></div></div><div className="hero-visual" aria-label="Vista previa de una cita médica"><div className="orb orb-one"/><div className="orb orb-two"/><div className="mock-card tilt"><div className="mock-top"><span className="avatar">AR</span><div><strong>Dra. Andrea Ruiz</strong><small>Medicina general</small></div><span className="available">✓ Disponible</span></div><div className="mock-date"><span>Próxima disponibilidad</span><strong>Mañana · 9:00 a. m.</strong></div><div className="mock-actions"><span>✓ Teclado</span><span>◉ Alto contraste</span><span>🎙 Voz</span></div></div></div></section><section className="feature-strip"><article><span>01</span><h2>Encuentra</h2><p>Explora médicos y especialidades con información clara.</p></article><article><span>02</span><h2>Reserva</h2><p>Elige el flujo normal o el modo simple de 3 pasos.</p></article><article><span>03</span><h2>Adapta</h2><p>Texto, contraste, movimiento, lectura guiada y más.</p></article></section></main><GlobalVoiceControl/><footer className="public-footer"><span>© 2026 Citas sin Barreras</span><Link to="/privacidad">Política de privacidad</Link></footer><AccessibilityToolbar/></div>;
}

function AuthPage({ mode }: { mode: 'login'|'register'|'forgot' }) {
  const navigate = useNavigate();
  const { login, register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [privacy, setPrivacy] = useState(false);
  const [sent, setSent] = useState(false);
  const title = mode==='login'?'Bienvenido de nuevo':mode==='register'?'Crea tu cuenta':'Recupera tu acceso';
  const subtitle = mode==='login'?'Ingresa para gestionar tus citas y preferencias.':mode==='register'?'Toma menos de dos minutos. Luego podrás adaptar la interfaz.':'Ingresa tu correo para recuperar el acceso.';
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode==='forgot') { setSent(true); return; }
    if (mode==='register') { register({name:name||'Paciente',email,phone}); navigate('/accesibilidad/inicial'); }
    else { login(email||'paciente@demo.pe'); navigate('/inicio'); }
  };
  return <div className="auth-page"><div className="auth-brand"><Link to="/" className="brand light"><span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" fill="currentColor"/></svg></span><span><strong>Citas sin Barreras</strong><small>Salud accesible</small></span></Link><div className="auth-message"><span className="pill inverse">Diseñado para ti</span><h2>Una experiencia de salud que se adapta a la persona, no al revés.</h2><ul><li>✓ Navegación por teclado</li><li>✓ Preferencias de accesibilidad</li><li>✓ Control y dictado por voz</li><li>✓ Modo simple de reserva</li></ul></div></div><main id="main" className="auth-panel"><div className="auth-card"><Link className="back-link" to="/">← Volver al inicio</Link><span className="eyebrow">Portal del paciente</span><h1>{title}</h1><p>{subtitle}</p>{sent?<div className="success-box"><span className="success-icon">✓</span><h2>Revisa tu correo</h2><p>Puedes volver al inicio de sesión e ingresar nuevamente cuando estés listo.</p><Link className="btn btn-primary" to="/login">Volver al login</Link></div>:<form onSubmit={submit} className="auth-form">{mode==='register'&&<Field label="Nombre completo" value={name} setValue={setName} voice required/>}<Field label="Correo electrónico" type="email" value={email} setValue={setEmail} voice required placeholder="nombre@correo.com"/>{mode==='register'&&<Field label="Teléfono (opcional)" value={phone} setValue={setPhone} voice placeholder="999 999 999"/>}{mode!=='forgot'&&<Field label="Contraseña" type="password" value={password} setValue={setPassword} required placeholder="Mínimo 8 caracteres"/>}{mode==='register'&&<label className="check-row"><input type="checkbox" checked={privacy} onChange={e=>setPrivacy(e.target.checked)} required/><span>Acepto la <Link to="/privacidad">política de privacidad</Link>.</span></label>}{mode==='login'&&<div className="form-row"><label className="check-row"><input type="checkbox"/><span>Recordar correo</span></label><Link to="/recuperar">¿Olvidaste tu contraseña?</Link></div>}<Button type="submit" disabled={mode==='register'&&!privacy}>{mode==='login'?'Ingresar':mode==='register'?'Crear cuenta':'Enviar instrucciones'}</Button></form>}<div className="auth-switch">{mode==='login'?<>¿No tienes cuenta? <Link to="/registro">Crear cuenta</Link></>:mode==='register'?<>¿Ya tienes cuenta? <Link to="/login">Ingresar</Link></>:<Link to="/login">← Volver al login</Link>}</div></div></main><AccessibilityToolbar/><GlobalVoiceControl/></div>;
}

function Field({ label, value, setValue, type='text', voice=false, ...props }: { label:string; value:string; setValue:(v:string)=>void; type?:string; voice?:boolean } & Omit<React.InputHTMLAttributes<HTMLInputElement>,'value'|'onChange'>) {
  const id = React.useId();
  return <div className="field"><label htmlFor={id}>{label}</label><div className="field-control"><input id={id} type={type} value={value} onChange={e=>setValue(e.target.value)} {...props}/>{voice&&type!=='password'&&<VoiceInput onText={(t)=>setValue(value ? `${value} ${t}` : t)}/>}</div></div>;
}

function Dashboard() {
  const { patient } = useAuth();
  const { appointments } = useContext(AppointmentContext);
  const active = appointments.find(a=>a.status!=='cancelled'&&a.status!=='attended');
  return <AppShell><Page><section className="welcome-banner"><div><span className="eyebrow">Buenos días</span><h1>Hola, {patient?.name?.split(' ')[0]} 👋</h1><p>Tu salud organizada de forma simple y accesible.</p></div><Link className="btn btn-primary" to="/reservar"><Icon name="calendar"/> Reservar nueva cita</Link></section><div className="dashboard-grid"><section className="card feature-card"><div className="section-head"><div><span className="eyebrow">Próxima cita</span><h2>{active?'Todo listo para tu atención':'No tienes citas próximas'}</h2></div>{active&&<StatusBadge status={active.status}/>}</div>{active?<><div className="appointment-hero"><div className="date-tile"><strong>{new Date(`${active.date}T12:00`).getDate()}</strong><span>{new Intl.DateTimeFormat('es-PE',{month:'short'}).format(new Date(`${active.date}T12:00`))}</span></div><div><h3>{active.doctor}</h3><p>{active.specialty}</p><p className="meta"><Icon name="clock"/> {dateLabel(active.date)} · {active.time}</p></div></div><div className="card-actions"><Link className="btn btn-secondary" to={`/citas/${active.id}`}>Ver detalle</Link><Link className="text-link" to="/citas">Todas mis citas →</Link></div></>:<div className="empty-mini"><p>Agenda cuando lo necesites. Puedes buscar por especialidad o médico.</p><Link className="btn btn-primary" to="/reservar">Reservar cita</Link></div>}</section><section className="card wellbeing-card"><span className="decor-heart"><Icon name="heart"/></span><span className="eyebrow">Accesibilidad</span><h2>Haz que el portal funcione para ti</h2><p>Personaliza texto, contraste, movimiento, lectura guiada y mucho más.</p><Link className="btn btn-secondary" to="/accesibilidad">Abrir preferencias</Link></section></div><section className="quick-section"><div className="section-head"><div><span className="eyebrow">Accesos rápidos</span><h2>¿Qué necesitas hacer?</h2></div></div><div className="quick-grid"><QuickCard icon="doctor" title="Buscar médico" text="Explora profesionales por especialidad." to="/medicos"/><QuickCard icon="calendar" title="Mis citas" text="Consulta, reprograma o cancela." to="/citas"/><QuickCard icon="access" title="Accesibilidad" text="Adapta la experiencia a tus necesidades." to="/accesibilidad"/><QuickCard icon="profile" title="Mi perfil" text="Actualiza tus datos personales." to="/perfil"/></div></section></Page></AppShell>;
}

function QuickCard({ icon, title, text, to }: { icon:'doctor'|'calendar'|'access'|'profile'; title:string; text:string; to:string }) {
  return <Link to={to} className="quick-card"><span className="quick-icon"><Icon name={icon}/></span><span><strong>{title}</strong><small>{text}</small></span><span className="arrow">→</span></Link>;
}

function StatusBadge({ status }: { status: AppointmentStatus }) {
  const labels: Record<AppointmentStatus,string> = {pending:'Pendiente',confirmed:'Confirmada',attended:'Atendida',no_show:'Inasistencia',cancelled:'Cancelada'};
  return <span className={`status status-${status}`}><span aria-hidden="true">{status==='attended'||status==='confirmed'?'✓':status==='cancelled'?'×':'●'}</span>{labels[status]}</span>;
}

function DoctorsPage() {
  const [params]=useSearchParams();
  const [query,setQuery]=useState('');
  const [specialty,setSpecialty]=useState(()=>params.get('specialty') || 'Todas');
  const filtered=doctors.filter(d=>(specialty==='Todas'||d.specialty===specialty)&&`${d.name} ${d.specialty}`.toLowerCase().includes(query.toLowerCase()));
  return <AppShell><Page><PageHeader eyebrow="Directorio" title="Encuentra al profesional indicado" text="Filtra por especialidad o busca por nombre. Toda la información importante está visible antes de reservar." action={<Link className="btn btn-secondary" to="/especialidades">Ver especialidades</Link>}/><div className="filter-card"><div className="search-box"><Icon name="search"/><input aria-label="Buscar médico" placeholder="Buscar médico o especialidad" value={query} onChange={e=>setQuery(e.target.value)}/><VoiceInput label="Dictar búsqueda" onText={setQuery}/></div><select aria-label="Filtrar por especialidad" value={specialty} onChange={e=>setSpecialty(e.target.value)}><option>Todas</option>{specialties.map(s=><option key={s.name}>{s.name}</option>)}</select></div><div className="results-summary" aria-live="polite"><strong>{filtered.length}</strong> profesionales disponibles</div><div className="doctor-grid">{filtered.map(d=><DoctorCard key={d.id} doctor={d}/>)}</div>{!filtered.length&&<EmptyState title="No encontramos coincidencias" text="Prueba con otra especialidad o elimina el texto de búsqueda." action={<Button variant="secondary" onClick={()=>{setQuery('');setSpecialty('Todas')}}>Limpiar filtros</Button>}/>}</Page></AppShell>;
}

function DoctorCard({doctor}:{doctor:Doctor}) {
  return <article className="card doctor-card"><div className="doctor-top"><span className="avatar doctor-avatar">{doctor.initials}</span><div><h2>{doctor.name}</h2><p>{doctor.specialty}</p></div><span className="rating">★ {doctor.rating}</span></div><div className="doctor-meta"><span><strong>{doctor.years}</strong> años de experiencia</span><span className="availability"><span>✓</span> {doctor.next}</span></div><div className="card-actions"><Link className="btn btn-primary" to={`/reservar?doctor=${doctor.id}`}>Reservar cita</Link><Link className="btn btn-ghost" to={`/medicos/${doctor.id}`}>Ver perfil</Link></div></article>;
}

function DoctorDetail() {
  const {id}=useParams(); const d=doctors.find(x=>x.id===id)??doctors[0];
  return <AppShell><Page><Link className="back-link" to="/medicos">← Volver a médicos</Link><section className="doctor-profile card"><div className="profile-head"><span className="avatar profile-avatar">{d.initials}</span><div><span className="eyebrow">{d.specialty}</span><h1>{d.name}</h1><p>★ {d.rating} · {d.years} años de experiencia</p></div><Link className="btn btn-primary" to={`/reservar?doctor=${d.id}`}>Reservar cita</Link></div><div className="profile-columns"><div><h2>Sobre la atención</h2><p>Atención centrada en la persona, comunicación clara y tiempo para resolver dudas. Conoce la experiencia, los idiomas y los próximos horarios antes de reservar.</p><h3>Idiomas</h3><p>Español · Inglés básico</p></div><div className="availability-box"><span className="eyebrow">Próxima disponibilidad</span><strong>{d.next}</strong><p>También puedes comparar otros horarios durante la reserva.</p></div></div></section></Page></AppShell>;
}

function SpecialtiesPage(){return <AppShell><Page><PageHeader eyebrow="Especialidades" title="¿Qué tipo de atención necesitas?" text="Selecciona una especialidad para ver profesionales disponibles."/><div className="specialty-grid">{specialties.map(s=><Link key={s.name} className="specialty-card" to={`/medicos?specialty=${encodeURIComponent(s.name)}`}><span className="specialty-icon">{s.icon}</span><h2>{s.name}</h2><p>{s.desc}</p><span className="text-link">Ver médicos →</span></Link>)}</div></Page></AppShell>}

function PageHeader({eyebrow,title,text,action}:{eyebrow:string;title:string;text:string;action?:React.ReactNode}){return <div className="page-header"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{text}</p></div>{action}</div>}

function EmptyState({title,text,action}:{title:string;text:string;action?:React.ReactNode}){return <div className="empty-state"><span className="empty-illustration">◇</span><h2>{title}</h2><p>{text}</p>{action}</div>}


const emptyDraft:BookingDraft={specialty:'',doctorId:'',date:'',time:'',reason:''};

function ConversationBooking({draft,setDraft,confirm}:{draft:BookingDraft;setDraft:React.Dispatch<React.SetStateAction<BookingDraft>>;confirm:()=>void}) {
  const location = useLocation();
  const [request, setRequest] = useState('');
  const [notes, setNotes] = useState<string[]>([]);
  const [review, setReview] = useState(false);
  const [editing, setEditing] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const consumed = useRef('');
  const [pending, setPending] = useState(false);
  const dates = bookingDates();
  const prepare = (text: string) => {
    if (!text.trim()) return;
    const result = parseBooking(text, doctors);
    setDraft(result.draft);
    setRequest(text);
    setNotes(result.notes);
    setReview(true);
    setEditing(!validBooking(result.draft, doctors));
    setPending(false);
  };
  useEffect(() => {
    const incoming = sessionStorage.getItem('cmb:conversation');
    if (!incoming || consumed.current === location.key) return;
    consumed.current = location.key;
    prepare(incoming);
    sessionStorage.removeItem('cmb:conversation');
  }, [location.key]);
  useEffect(() => { if (review) heading.current?.focus({preventScroll:true}); }, [review]);
  const changeRequest = (text: string) => { setRequest(text); setPending(true); };
  return <section className="conversation-booking card" aria-labelledby="conversation-title">
    <div className="conversation-heading"><Icon name="mic"/><div><h2 id="conversation-title">Reserva con tus palabras</h2><p>Escribe o dicta lo que necesitas y revisa la propuesta antes de confirmar.</p></div></div>
    <form onSubmit={e=>{e.preventDefault();prepare(request)}}>
      <label htmlFor="booking-request">¿Qué cita necesitas?</label>
      <div className="conversation-input"><textarea id="booking-request" rows={2} maxLength={400} value={request} onChange={e=>changeRequest(e.target.value)} placeholder="Quiero cardiología el viernes en la mañana" aria-describedby="conversation-help"/><VoiceInput label="Dictar solicitud de cita" onText={text=>prepare(text.slice(0,400))}/></div>
      <div className="conversation-actions"><small id="conversation-help">Puedes indicar especialidad, hoy, mañana, un día de la semana o fecha (DD/MM), y hora. Horarios disponibles.</small><Button type="submit" disabled={!request.trim()}>{review?'Actualizar borrador':'Preparar borrador'}</Button></div>
    </form>
    {review && <div className="conversation-review">
      <h3 ref={heading} tabIndex={-1}>Borrador de tu cita</h3>
      {notes.length>0 && <ul className="conversation-notes">{notes.map(note=><li key={note}>{note}</li>)}</ul>}
      {pending && <p role="status">Cambiaste la solicitud. Pulsa “Actualizar borrador” para revisarla antes de confirmar.</p>}
      {editing ? <div className="form-grid conversation-fields">
        <label>Especialidad<select value={draft.specialty} onChange={e=>setDraft(p=>({...p,specialty:e.target.value,doctorId:''}))}><option value="">Seleccionar especialidad</option>{specialties.map(s=><option key={s.name}>{s.name}</option>)}</select></label>
        <label>Profesional<select value={draft.doctorId} onChange={e=>setDraft(p=>({...p,doctorId:e.target.value}))}><option value="">Seleccionar profesional</option>{doctors.filter(d=>d.specialty===draft.specialty).map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
        <label>Fecha<input type="date" min={dates[0]} max={dates[dates.length-1]} value={draft.date} onChange={e=>setDraft(p=>({...p,date:e.target.value}))}/></label>
        <label>Hora<select value={draft.time} onChange={e=>setDraft(p=>({...p,time:e.target.value}))}><option value="">Seleccionar hora</option>{bookingTimes.map(time=><option key={time}>{time}</option>)}</select></label>
        <label className="conversation-reason">Motivo (opcional)<input maxLength={220} value={draft.reason} onChange={e=>setDraft(p=>({...p,reason:e.target.value}))}/></label>
      </div> : <Summary draft={draft}/>}
      {!validBooking(draft,doctors) && <p role="status">Completa especialidad, profesional, una fecha válida y un horario para continuar.</p>}
      <div className="conversation-buttons">{editing ? <Button type="button" disabled={!validBooking(draft,doctors)} onClick={()=>{setEditing(false);setNotes([])}}>Revisar cambios</Button> : <><Button variant="secondary" onClick={()=>setEditing(true)}>Editar borrador</Button><Button disabled={pending||!validBooking(draft,doctors)} onClick={()=>{stopActiveSpeech();confirm()}}>Confirmar esta cita</Button></>}</div>
      <p className="form-note">La cita solo se registra cuando pulsas “Confirmar esta cita”. También puedes continuar con la reserva paso a paso.</p>
    </div>}
  </section>;
}

function BookingPage(){
  const {prefs}=useAccessibility(); const [params]=useSearchParams(); const navigate=useNavigate(); const {addAppointment}=useContext(AppointmentContext);
  const [draft,setDraft]=useState<BookingDraft>(()=>readSessionJSON('cmb:booking',emptyDraft)); const [step,setStep]=useState(1); const [done,setDone]=useState<Appointment|null>(null);
  useEffect(()=>{const id=params.get('doctor');if(id){const d=doctors.find(x=>x.id===id);if(d)setDraft(prev=>({...prev,doctorId:d.id,specialty:d.specialty}))}},[params]);
  useEffect(()=>sessionStorage.setItem('cmb:booking',JSON.stringify(draft)),[draft]);
  const submitted=useRef(false);
  const total=prefs.simpleMode?3:7;
  useEffect(()=>setStep(s=>Math.min(s,total)),[total]);
  const next=()=>setStep(s=>Math.min(total,s+1)); const prev=()=>setStep(s=>Math.max(1,s-1));
  const selectedDoctor=doctors.find(d=>d.id===draft.doctorId);
  const confirm=()=>{if(!selectedDoctor||!validBooking(draft,doctors)||submitted.current)return;submitted.current=true;const a=addAppointment({specialty:draft.specialty,doctor:selectedDoctor.name,date:draft.date,time:draft.time,reason:draft.reason});setDone(a);sessionStorage.removeItem('cmb:booking');};
  if(done)return <AppShell><Page><div className="booking-success"><span className="success-ring"><Icon name="check"/></span><span className="eyebrow">Cita registrada</span><h1>¡Listo! Tu solicitud fue creada.</h1><p>Tu código es <strong>{done.code}</strong>. Podrás consultar el estado desde “Mis citas”.</p><ReadAloud text={`Tu solicitud de ${done.specialty} con ${done.doctor} fue registrada para el ${dateLabel(done.date)} a las ${done.time}. Código ${done.code}.`}/><div className="success-summary"><span>{done.doctor}</span><strong>{dateLabel(done.date)} · {done.time}</strong><span>{done.specialty}</span></div><div className="hero-actions"><Button onClick={()=>navigate(`/citas/${done.id}`)}>Ver detalle</Button><Button variant="secondary" onClick={()=>navigate('/inicio')}>Volver al inicio</Button></div></div></Page></AppShell>;
  const canContinue=()=>{if(prefs.simpleMode){if(step===1)return !!draft.specialty&&!!draft.doctorId;if(step===2)return !!draft.date&&!!draft.time;return true;} const req=[draft.specialty,draft.doctorId,draft.date,draft.time]; return step<=4?!!req[step-1]:true};
  return <AppShell><Page><div className="booking-header"><div><span className="eyebrow">Nueva cita</span><h1>{prefs.simpleMode?'Reserva simple':'Reserva paso a paso'}</h1><p>{prefs.simpleMode?'3 pasos agrupados para reducir la carga de información.':'Te acompañamos en cada decisión. Puedes volver sin perder tus datos.'}</p></div><div className="mode-badge">{prefs.simpleMode?'Modo simple · 3 pasos':'Modo estándar · 7 pasos'}</div></div><ConversationBooking draft={draft} setDraft={setDraft} confirm={confirm}/><Progress current={step} total={total}/><section className="booking-card card"><AnimatePresence mode="wait"><motion.div key={`${prefs.simpleMode}-${step}`} initial={prefs.reducedMotion?false:{opacity:0,x:18}} animate={{opacity:1,x:0}} exit={prefs.reducedMotion?undefined:{opacity:0,x:-12}}>{prefs.simpleMode?<SimpleBookingStep step={step} draft={draft} setDraft={setDraft}/>:<StandardBookingStep step={step} draft={draft} setDraft={setDraft} confirm={confirm}/>}</motion.div></AnimatePresence><div className="wizard-actions"><Button variant="ghost" onClick={()=>step===1?navigate('/inicio'):prev()}>{step===1?'Cancelar':'← Anterior'}</Button>{step<total?<Button onClick={next} disabled={!canContinue()}>Continuar →</Button>:<Button onClick={confirm} disabled={!validBooking(draft,doctors)}>Confirmar cita</Button>}</div></section></Page></AppShell>;
}

function Progress({current,total}:{current:number;total:number}){return <div className="progress-wrap" aria-label={`Paso ${current} de ${total}`}><div className="progress-meta"><span>Paso {current} de {total}</span><span>{Math.round((current/total)*100)}%</span></div><div className="progress-track"><span style={{width:`${(current/total)*100}%`}}/></div></div>}

function StandardBookingStep({step,draft,setDraft,confirm}:{step:number;draft:BookingDraft;setDraft:React.Dispatch<React.SetStateAction<BookingDraft>>;confirm:()=>void}){
  if(step===1)return <ChoiceSpecialty draft={draft} setDraft={setDraft}/>;
  if(step===2)return <ChoiceDoctor draft={draft} setDraft={setDraft}/>;
  if(step===3)return <ChoiceDate draft={draft} setDraft={setDraft}/>;
  if(step===4)return <ChoiceTime draft={draft} setDraft={setDraft}/>;
  if(step===5)return <ReasonStep draft={draft} setDraft={setDraft}/>;
  if(step===6)return <Summary draft={draft}/>;
  return <div className="wizard-step"><span className="step-icon">✓</span><h2>¿Confirmamos esta cita?</h2><p>Revisa una vez más. La reserva solo se crea cuando presionas “Confirmar cita”.</p><Summary draft={draft} compact/><p className="form-note">Al confirmar, la cita quedará guardada únicamente en tu navegador.</p></div>;
}

function SimpleBookingStep({step,draft,setDraft}:{step:number;draft:BookingDraft;setDraft:React.Dispatch<React.SetStateAction<BookingDraft>>}){
  if(step===1)return <div className="wizard-step"><h2>1. Elige especialidad y médico</h2><p>Primero el tipo de atención y luego el profesional.</p><ChoiceSpecialty draft={draft} setDraft={setDraft} embedded/><ChoiceDoctor draft={draft} setDraft={setDraft} embedded/></div>;
  if(step===2)return <div className="wizard-step"><h2>2. Elige fecha y hora</h2><p>Mostramos los horarios disponibles para la fecha elegida.</p><ChoiceDate draft={draft} setDraft={setDraft} embedded/><ChoiceTime draft={draft} setDraft={setDraft} embedded/></div>;
  return <div className="wizard-step"><h2>3. Revisa y confirma</h2><ReasonStep draft={draft} setDraft={setDraft} embedded/><Summary draft={draft} compact/></div>;
}

function ChoiceSpecialty({draft,setDraft,embedded=false}:{draft:BookingDraft;setDraft:React.Dispatch<React.SetStateAction<BookingDraft>>;embedded?:boolean}){return <div className={embedded?'substep':'wizard-step'}>{!embedded&&<><span className="eyebrow">Especialidad</span><h2>¿Qué atención necesitas?</h2><p>Selecciona una opción para mostrar médicos relacionados.</p></>}<div className="choice-grid">{specialties.map(s=><button key={s.name} className={`choice-card ${draft.specialty===s.name?'selected':''}`} onClick={()=>setDraft(p=>({...p,specialty:s.name,doctorId:p.specialty===s.name?p.doctorId:''}))}><span>{s.icon}</span><strong>{s.name}</strong><small>{s.desc}</small></button>)}</div></div>}
function ChoiceDoctor({draft,setDraft,embedded=false}:{draft:BookingDraft;setDraft:React.Dispatch<React.SetStateAction<BookingDraft>>;embedded?:boolean}){const list=doctors.filter(d=>!draft.specialty||d.specialty===draft.specialty);return <div className={embedded?'substep':'wizard-step'}>{!embedded&&<><span className="eyebrow">Profesional</span><h2>Elige a tu médico</h2><p>{draft.specialty||'Selecciona antes una especialidad.'}</p></>}<div className="doctor-choice-list">{list.map(d=><button key={d.id} className={`doctor-choice ${draft.doctorId===d.id?'selected':''}`} onClick={()=>setDraft(p=>({...p,doctorId:d.id,specialty:d.specialty}))}><span className="avatar mini">{d.initials}</span><span><strong>{d.name}</strong><small>{d.specialty} · ★ {d.rating}</small></span><span className="radio-dot"/></button>)}</div></div>}
function ChoiceDate({draft,setDraft,embedded=false}:{draft:BookingDraft;setDraft:React.Dispatch<React.SetStateAction<BookingDraft>>;embedded?:boolean}){const dates=bookingDates();return <div className={embedded?'substep':'wizard-step'}>{!embedded&&<><span className="eyebrow">Fecha</span><h2>¿Qué día te conviene?</h2><p>Selecciona una fecha dentro de los próximos 30 días.</p></>}<div className="date-choice-grid">{dates.map(v=>{const d=new Date(`${v}T12:00`);return <button key={v} className={`date-choice ${draft.date===v?'selected':''}`} onClick={()=>setDraft(p=>({...p,date:v,time:''}))}><span>{new Intl.DateTimeFormat('es-PE',{weekday:'short'}).format(d)}</span><strong>{d.getDate()}</strong><small>{new Intl.DateTimeFormat('es-PE',{month:'short'}).format(d)}</small></button>})}</div></div>}
function ChoiceTime({draft,setDraft,embedded=false}:{draft:BookingDraft;setDraft:React.Dispatch<React.SetStateAction<BookingDraft>>;embedded?:boolean}){const times=bookingTimes;return <div className={embedded?'substep':'wizard-step'}>{!embedded&&<><span className="eyebrow">Hora</span><h2>Selecciona un horario</h2><p>{draft.date?dateLabel(draft.date):'Primero elige una fecha.'}</p></>}<div className="time-grid">{times.map(t=><button key={t} className={`time-choice ${draft.time===t?'selected':''}`} onClick={()=>setDraft(p=>({...p,time:t}))}><Icon name="clock"/>{t}</button>)}</div></div>}
function ReasonStep({draft,setDraft,embedded=false}:{draft:BookingDraft;setDraft:React.Dispatch<React.SetStateAction<BookingDraft>>;embedded?:boolean}){return <div className={embedded?'substep':'wizard-step'}>{!embedded&&<><span className="eyebrow">Motivo</span><h2>¿Quieres contar brevemente el motivo?</h2><p>Es opcional. Evita ingresar información sensible innecesaria.</p></>}<div className="field"><label htmlFor="reason">Motivo de la cita (opcional)</label><div className="field-control textarea-control"><textarea id="reason" maxLength={220} value={draft.reason} onChange={e=>setDraft(p=>({...p,reason:e.target.value}))} placeholder="Ej.: control general o dolor de cabeza recurrente"/><VoiceInput label="Dictar motivo de la cita" onText={t=>setDraft(p=>({...p,reason:p.reason?`${p.reason} ${t}`:t}))}/></div><small>{draft.reason.length}/220 caracteres</small></div></div>}
function Summary({draft,compact=false}:{draft:BookingDraft;compact?:boolean}){const d=doctors.find(x=>x.id===draft.doctorId);return <><ReadAloud text={`Resumen de tu cita. Especialidad: ${draft.specialty || 'sin seleccionar'}. Profesional: ${d?.name || 'sin seleccionar'}. Fecha: ${draft.date ? dateLabel(draft.date) : 'sin seleccionar'}. Hora: ${draft.time || 'sin seleccionar'}. Motivo: ${draft.reason || 'no indicado'}.`}/><div className={`summary-card ${compact?'compact':''}`}><SummaryRow label="Especialidad" value={draft.specialty||'Sin seleccionar'}/><SummaryRow label="Médico" value={d?.name||'Sin seleccionar'}/><SummaryRow label="Fecha" value={draft.date?dateLabel(draft.date):'Sin seleccionar'}/><SummaryRow label="Hora" value={draft.time||'Sin seleccionar'}/><SummaryRow label="Motivo" value={draft.reason||'Sin motivo registrado'}/></div></>}
function SummaryRow({label,value}:{label:string;value:string}){return <div className="summary-row"><span>{label}</span><strong>{value}</strong></div>}

function AppointmentsPage(){const {appointments}=useContext(AppointmentContext);const [filter,setFilter]=useState<'all'|AppointmentStatus>('all');const list=filter==='all'?appointments:appointments.filter(a=>a.status===filter);return <AppShell><Page><PageHeader eyebrow="Mis citas" title="Tu agenda de salud" text="Consulta el estado, revisa detalles o gestiona tus próximas citas." action={<Link className="btn btn-primary" to="/reservar">+ Nueva cita</Link>}/><div className="tabs" role="tablist" aria-label="Filtrar citas">{([['all','Todas'],['pending','Pendientes'],['confirmed','Confirmadas'],['cancelled','Canceladas']] as const).map(([v,l])=><button key={v} role="tab" aria-selected={filter===v} className={filter===v?'active':''} onClick={()=>setFilter(v)}>{l}</button>)}</div>{list.length?<div className="appointment-list">{list.map(a=><Link key={a.id} to={`/citas/${a.id}`} className="appointment-row"><div className="date-tile"><strong>{new Date(`${a.date}T12:00`).getDate()}</strong><span>{new Intl.DateTimeFormat('es-PE',{month:'short'}).format(new Date(`${a.date}T12:00`))}</span></div><div className="appointment-main"><div><h2>{a.doctor}</h2><p>{a.specialty}</p></div><div className="appointment-side"><StatusBadge status={a.status}/><span>{a.time}</span></div></div><span className="arrow">→</span></Link>)}</div>:<EmptyState title="No hay citas en este filtro" text="Puedes cambiar el filtro o reservar una nueva cita." action={<Link className="btn btn-primary" to="/reservar">Reservar cita</Link>}/>}</Page></AppShell>}

function AppointmentDetail(){const {id}=useParams();const {appointments,cancelAppointment,rescheduleAppointment}=useContext(AppointmentContext);const navigate=useNavigate();const a=appointments.find(x=>x.id===id);const [cancelOpen,setCancelOpen]=useState(false);const [reschedule,setReschedule]=useState(false);const [date,setDate]=useState(a?.date||'2026-10-05');const [time,setTime]=useState(a?.time||'10:30');if(!a)return <AppShell><Page><EmptyState title="Cita no encontrada" text="Puede que el enlace ya no esté disponible." action={<Button onClick={()=>navigate('/citas')}>Volver a mis citas</Button>}/></Page></AppShell>;return <AppShell><Page><Link className="back-link" to="/citas">← Volver a mis citas</Link><div className="detail-grid"><section className="card detail-card"><div className="section-head"><div><span className="eyebrow">Código {a.code}</span><h1>Detalle de la cita</h1></div><StatusBadge status={a.status}/></div><div className="detail-doctor"><span className="avatar doctor-avatar">{doctors.find(d=>d.name===a.doctor)?.initials||'MD'}</span><div><h2>{a.doctor}</h2><p>{a.specialty}</p></div></div><ReadAloud text={`Cita de ${a.specialty} con ${a.doctor}. Fecha: ${dateLabel(a.date)}. Hora: ${a.time}. Motivo: ${a.reason || 'no indicado'}.`}/><div className="detail-info"><SummaryRow label="Fecha" value={dateLabel(a.date)}/><SummaryRow label="Hora" value={a.time}/><SummaryRow label="Motivo" value={a.reason||'Sin motivo registrado'}/><SummaryRow label="Modalidad" value="Presencial"/></div>{a.status!=='cancelled'&&a.status!=='attended'&&<div className="card-actions"><Button variant="secondary" onClick={()=>setReschedule(true)}>Reprogramar</Button><Button variant="danger" onClick={()=>setCancelOpen(true)}>Cancelar cita</Button></div>}</section><aside className="card help-card"><span className="eyebrow">Antes de tu cita</span><h2>Ten a mano lo necesario</h2><ul><li>Documento de identidad.</li><li>Lista de medicamentos si aplica.</li><li>Tus preguntas principales.</li></ul></aside></div>{cancelOpen&&<Modal title="Cancelar cita" onClose={()=>setCancelOpen(false)}><p>¿Confirmas que deseas cancelar tu cita con <strong>{a.doctor}</strong>?</p><p>Al confirmar, la cita cambiará al estado “Cancelada”.</p><div className="modal-actions"><Button variant="ghost" onClick={()=>setCancelOpen(false)}>Volver</Button><Button variant="danger" onClick={()=>{cancelAppointment(a.id);setCancelOpen(false)}}>Sí, cancelar cita</Button></div></Modal>}{reschedule&&<Modal title="Reprogramar cita" onClose={()=>setReschedule(false)}><p>Elige una nueva fecha y hora. Tu cita actual se conserva hasta confirmar.</p><div className="form-grid"><label>Fecha<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label>Hora<select value={time} onChange={e=>setTime(e.target.value)}>{['08:30','09:00','10:30','11:30','14:00','16:00'].map(t=><option key={t}>{t}</option>)}</select></label></div><div className="modal-actions"><Button variant="ghost" onClick={()=>setReschedule(false)}>Cancelar</Button><Button onClick={()=>{rescheduleAppointment(a.id,date,time);setReschedule(false)}}>Guardar nuevo horario</Button></div></Modal>}</Page></AppShell>}

function Modal({title,children,onClose}:{title:string;children:React.ReactNode;onClose:()=>void}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const titleId = React.useId();
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const keys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]') || []).filter(el => el.getClientRects().length);
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (!first) { event.preventDefault(); ref.current?.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !ref.current?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !ref.current?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keys);
    return () => { document.removeEventListener('keydown', keys); document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus({preventScroll:true}); };
  }, []);
  return createPortal(<div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.currentTarget===e.target)onClose()}}><motion.div ref={ref} tabIndex={-1} className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} initial={{opacity:0,scale:.97}} animate={{opacity:1,scale:1}}><div className="panel-head"><h2 id={titleId}>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Cerrar"><Icon name="x"/></button></div>{children}</motion.div></div>, document.body);
}

function AccessibilityPage({onboarding=false}:{onboarding?:boolean}){const {prefs,setPrefs,resetPrefs}=useAccessibility();const navigate=useNavigate();const presets=[{name:'Estándar',desc:'Configuración equilibrada.',apply:defaultPrefs},{name:'Baja visión',desc:'Texto grande, alto contraste y lupa.',apply:{...defaultPrefs,fontScale:'large' as FontScale,highContrast:true,magnifier:true}},{name:'Movilidad reducida',desc:'Cursor grande y menos movimiento.',apply:{...defaultPrefs,largeCursor:true,reducedMotion:true}},{name:'Daltonismo',desc:'Refuerzo visual de estados.',apply:{...defaultPrefs,colorBlind:true}},{name:'Concentración',desc:'Modo simple y movimiento reducido.',apply:{...defaultPrefs,simpleMode:true,reducedMotion:true}},{name:'Adulto mayor',desc:'Texto grande y modo simple.',apply:{...defaultPrefs,fontScale:'large' as FontScale,simpleMode:true}}];return <AppShell><Page>{onboarding?<PageHeader eyebrow="Paso opcional" title="¿Cómo prefieres usar el portal?" text="Puedes elegir un perfil, personalizarlo o continuar sin cambios. Podrás modificarlo después."/>:<PageHeader eyebrow="Accesibilidad" title="Una interfaz que se adapta a ti" text="Estas preferencias se guardan en este navegador."/>}<section className="preset-section"><h2>Perfiles rápidos</h2><div className="preset-grid">{presets.map(p=><button key={p.name} className="preset-card" onClick={()=>setPrefs(p.apply)}><strong>{p.name}</strong><span>{p.desc}</span></button>)}</div></section><section className="settings-card card"><div className="settings-head"><div><span className="eyebrow">Personalización</span><h2>Ajustes individuales</h2></div><Button variant="ghost" onClick={resetPrefs}>Restablecer</Button></div><SettingGroup title="Tamaño de texto" desc="Ajusta toda la interfaz sin perder contenido."><div className="font-controls large">{(['small','normal','large'] as FontScale[]).map((s,i)=><button key={s} className={prefs.fontScale===s?'active':''} onClick={()=>setPrefs(p=>({...p,fontScale:s}))}>{['A−','A','A+'][i]}</button>)}</div></SettingGroup><SettingGroup title="Alto contraste" desc="Fondo negro, texto blanco y controles amarillos."><Toggle checked={prefs.highContrast} label="Activar alto contraste" onChange={v=>setPrefs(p=>({...p,highContrast:v}))}/></SettingGroup><SettingGroup title="Cursor grande" desc="Facilita ubicar el puntero en escritorio."><Toggle checked={prefs.largeCursor} label="Usar cursor grande" onChange={v=>setPrefs(p=>({...p,largeCursor:v}))}/></SettingGroup><SettingGroup title="Lupa de lectura" desc="Amplía el texto del elemento que señalas o enfocas."><Toggle checked={prefs.magnifier} label="Activar lupa" onChange={v=>setPrefs(p=>({...p,magnifier:v}))}/></SettingGroup><SettingGroup title="Lectura guiada" desc="Una banda horizontal ayuda a seguir la línea de lectura."><Toggle checked={prefs.guidedReading} label="Activar lectura guiada" onChange={v=>setPrefs(p=>({...p,guidedReading:v}))}/></SettingGroup><SettingGroup title="Modo simple" desc="Reduce el wizard de reserva de 7 a 3 pasos agrupados."><Toggle checked={prefs.simpleMode} label="Usar modo simple" onChange={v=>setPrefs(p=>({...p,simpleMode:v}))}/></SettingGroup><SettingGroup title="Movimiento reducido" desc="Desactiva desplazamientos, tilt y animaciones no esenciales."><Toggle checked={prefs.reducedMotion} label="Reducir movimiento" onChange={v=>setPrefs(p=>({...p,reducedMotion:v}))}/></SettingGroup><SettingGroup title="Daltonismo" desc="Los estados refuerzan texto, iconos y patrones, no solo color."><Toggle checked={prefs.colorBlind} label="Reforzar estados" onChange={v=>setPrefs(p=>({...p,colorBlind:v}))}/></SettingGroup><SettingGroup title="Voz" desc="Usa el botón “Voz” para navegar y los micrófonos de los formularios para dictar texto."><div className="voice-info"><Icon name="mic"/><span>Comandos globales y dictado disponibles en navegadores compatibles.</span></div></SettingGroup></section>{onboarding&&<div className="onboarding-actions"><Button variant="ghost" onClick={()=>navigate('/inicio')}>Omitir por ahora</Button><Button onClick={()=>navigate('/inicio')}>Guardar y continuar</Button></div>}</Page></AppShell>}
function SettingGroup({title,desc,children}:{title:string;desc:string;children:React.ReactNode}){return <div className="setting-group"><div><h3>{title}</h3><p>{desc}</p></div><div>{children}</div></div>}

function ProfilePage(){const {patient,register}=useAuth();const [name,setName]=useState(patient?.name||'');const [email,setEmail]=useState(patient?.email||'');const [phone,setPhone]=useState(patient?.phone||'');const [saved,setSaved]=useState(false);return <AppShell><Page><PageHeader eyebrow="Mi perfil" title="Tus datos personales" text="Actualiza la información básica de tu cuenta."/><section className="card profile-form-card"><div className="profile-summary"><span className="avatar profile-avatar">{name.slice(0,1)||'P'}</span><div><h2>{name||'Paciente'}</h2><p>Cuenta de paciente</p></div></div><form onSubmit={e=>{e.preventDefault();register({name,email,phone});setSaved(true)}} className="profile-form"><Field label="Nombre completo" value={name} setValue={setName} voice required/><Field label="Correo electrónico" type="email" value={email} setValue={setEmail} voice required/><Field label="Teléfono" value={phone} setValue={setPhone} voice/><Button type="submit">Guardar cambios</Button>{saved&&<span className="saved-message" role="status">✓ Cambios guardados</span>}</form></section></Page></AppShell>}

function PrivacyPage(){return <div className="public-page privacy-page"><PublicHeader/><main id="main" className="legal-wrap"><span className="eyebrow">Información pública</span><h1>Política de privacidad</h1><p className="lead">Tus datos permanecen en este navegador y no se envían a un servidor.</p><section><h2>1. Datos guardados</h2><p>Nombre, correo, teléfono opcional, preferencias de accesibilidad y citas. Evita ingresar información clínica innecesaria o datos sensibles.</p></section><section><h2>2. Finalidad</h2><p>Permitirte personalizar la interfaz, reservar citas y gestionar tu información.</p></section><section><h2>3. Almacenamiento</h2><p>La información se guarda mediante localStorage y sessionStorage, y puede eliminarse limpiando los datos del sitio.</p></section><section><h2>4. Tus controles</h2><p>Puedes modificar tus preferencias, datos personales y citas desde este navegador.</p></section><div className="legal-actions"><Link className="btn btn-primary" to="/registro">Volver al registro</Link><Link className="btn btn-secondary" to="/">Ir al inicio</Link></div></main><AccessibilityToolbar/><GlobalVoiceControl/></div>}

function NotFound(){const {patient}=useAuth();return <div className="error-page"><span className="error-code">404</span><h1>Esta página no está disponible</h1><p>Puede que el enlace haya cambiado o que la dirección no sea correcta.</p><Link className="btn btn-primary" to={patient?'/inicio':'/'}>{patient?'Volver al inicio':'Ir a la portada'}</Link></div>}

function App(){return <AccessibilityProvider><AuthProvider><AppointmentProvider><Routes><Route path="/" element={<Landing/>}/><Route path="/login" element={<AuthPage mode="login"/>}/><Route path="/registro" element={<AuthPage mode="register"/>}/><Route path="/recuperar" element={<AuthPage mode="forgot"/>}/><Route path="/privacidad" element={<PrivacyPage/>}/><Route path="/accesibilidad/inicial" element={<Protected><AccessibilityPage onboarding/></Protected>}/><Route path="/inicio" element={<Protected><Dashboard/></Protected>}/><Route path="/medicos" element={<Protected><DoctorsPage/></Protected>}/><Route path="/medicos/:id" element={<Protected><DoctorDetail/></Protected>}/><Route path="/especialidades" element={<Protected><SpecialtiesPage/></Protected>}/><Route path="/reservar" element={<Protected><BookingPage/></Protected>}/><Route path="/citas" element={<Protected><AppointmentsPage/></Protected>}/><Route path="/citas/:id" element={<Protected><AppointmentDetail/></Protected>}/><Route path="/accesibilidad" element={<Protected><AccessibilityPage/></Protected>}/><Route path="/perfil" element={<Protected><ProfilePage/></Protected>}/><Route path="*" element={<NotFound/>}/></Routes></AppointmentProvider></AuthProvider></AccessibilityProvider>}

export default App;
