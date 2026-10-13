import { fmt, type ISODate, weekday } from "../rules/dates";
import type { Student } from "../types";
import { isEnglish, templateLanguage } from "./language";
import { MEETING_TYPE_LABELS, STAFF_ROLE_LABELS, type Attendee, type Meeting, type NoticeCheck, type Slot } from "./model";
import { fmtTime } from "./time";

const ES_DAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const ES_MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function fmtDateIn(lang: "en" | "es", d: ISODate): string {
  if (lang === "en") return fmt(d);
  const [y, m, day] = d.split("-").map(Number);
  return `${ES_DAYS[weekday(d)]} ${day} de ${ES_MONTHS[m - 1]} de ${y}`;
}

function slotText(lang: "en" | "es", s: Slot): string {
  return lang === "en"
    ? `${fmtDateIn("en", s.date)}, ${fmtTime(s.start)} – ${fmtTime(s.end)}`
    : `${fmtDateIn("es", s.date)}, de ${fmtTime(s.start, "es")} a ${fmtTime(s.end, "es")}`;
}

const MEETING_TYPE_ES: Record<Meeting["type"], string> = {
  initial: "reunión inicial del IEP",
  triennial: "reunión trienal del IEP",
  annual: "revisión anual del IEP",
  "parent-request": "reunión del IEP que usted solicitó",
};

const PURPOSE: Record<Meeting["type"], { en: string; es: string }> = {
  initial: {
    en: "review your child's assessment results, decide whether your child is eligible for special education, and if so, develop an Individualized Education Program (IEP)",
    es: "revisar los resultados de la evaluación de su hijo(a), decidir si es elegible para educación especial y, si lo es, desarrollar un Programa de Educación Individualizado (IEP)",
  },
  triennial: {
    en: "review your child's reevaluation results, confirm continued eligibility, and review the IEP",
    es: "revisar los resultados de la reevaluación de su hijo(a), confirmar si sigue siendo elegible y revisar el IEP",
  },
  annual: {
    en: "review your child's progress and update the IEP for the coming year",
    es: "revisar el progreso de su hijo(a) y actualizar el IEP para el próximo año",
  },
  "parent-request": {
    en: "discuss the concerns you raised in your request",
    es: "hablar sobre las inquietudes que usted presentó en su solicitud",
  },
};

function roleLabel(lang: "en" | "es", a: Attendee): string {
  if (lang === "en") return a.role === "parent" ? "Parent/guardian" : STAFF_ROLE_LABELS[a.role];
  const es: Record<string, string> = {
    parent: "Padre/madre o tutor",
    administrator: "Administrador(a) / representante del distrito",
    "gen-ed-teacher": "Maestro(a) de educación general",
    "sped-teacher": "Maestro(a) de educación especial",
    "school-psychologist": "Psicólogo(a) escolar",
    "speech-therapist": "Terapeuta del habla y lenguaje",
    "occupational-therapist": "Terapeuta ocupacional",
    nurse: "Enfermero(a) escolar",
    interpreter: "Intérprete",
    other: "Otro",
  };
  return es[a.role];
}

export interface Coordinator {
  name: string;
  email: string;
  phone?: string;
  district: string;
}

export interface Draft {
  subject: string;
  body: string;
  language: string;
  needsTranslation: boolean;
}

function childName(s: Student, lang: "en" | "es"): string {
  return s.name?.split(" ")[0] || (lang === "en" ? "your child" : "su hijo(a)");
}

/** P1-6: the message asking the parent to pick one of three times. */
export function draftParentOptions(m: Meeting, s: Student, c: Coordinator): Draft {
  const lang = templateLanguage(m.parentLanguage) ?? "en";
  const needsTranslation = templateLanguage(m.parentLanguage) === null;
  const opts = m.options.map((o, i) => `  ${i + 1}) ${slotText(lang, o)}`).join("\n");
  const name = childName(s, lang);
  if (lang === "es") {
    return {
      language: "es",
      needsTranslation,
      subject: `Elija una hora para la ${MEETING_TYPE_ES[m.type]} de ${name}`,
      body: `Hola${s.parentName ? ` ${s.parentName}` : ""},\n\nNecesitamos reunirnos para la ${MEETING_TYPE_ES[m.type]} de ${name}. Estas horas funcionan para el equipo:\n\n${opts}\n\nResponda a este correo con el número de la hora que prefiera (1, 2 o 3). Si ninguna le funciona, responda "ninguna" y le enviaremos otras opciones.\n\nHabrá un intérprete de español en la reunión.\n\nGracias,\n${c.name}\n${c.district}\n${c.email}${c.phone ? `\n${c.phone}` : ""}`,
    };
  }
  return {
    language: needsTranslation ? m.parentLanguage : "en",
    needsTranslation,
    subject: `Pick a time for ${name}'s ${MEETING_TYPE_LABELS[m.type]} meeting`,
    body: `Hello${s.parentName ? ` ${s.parentName}` : ""},\n\nWe need to meet for ${name}'s ${MEETING_TYPE_LABELS[m.type]}. These times work for the team:\n\n${opts}\n\nPlease reply to this email with the number of the time you prefer (1, 2 or 3). If none of them work, reply "none" and we'll send other options.${!isEnglish(m.parentLanguage) ? `\n\nA ${m.parentLanguage} interpreter will be at the meeting.` : ""}\n\nThank you,\n${c.name}\n${c.district}\n${c.email}${c.phone ? `\n${c.phone}` : ""}`,
  };
}

/** P1-7: the formal meeting notice (EC 56341.5; 34 CFR 300.322(b)). */
export function draftNotice(m: Meeting, s: Student, c: Coordinator, opts: { update?: boolean } = {}): Draft {
  const slot = m.chosen!;
  const lang = templateLanguage(m.parentLanguage) ?? "en";
  const needsTranslation = templateLanguage(m.parentLanguage) === null;
  const name = childName(s, lang);
  const team = m.attendees
    .filter((a) => a.role !== "parent")
    .map((a) => `  • ${roleLabel(lang, a)}${a.name && !/not assigned/i.test(a.name) ? `: ${a.name}` : ""}`)
    .join("\n");
  if (lang === "es") {
    return {
      language: "es",
      needsTranslation,
      subject: `${opts.update ? "Cambio: " : ""}Aviso de reunión del IEP de ${name}: ${fmtDateIn("es", slot.date)}`,
      body: [
        `Estimado(a) ${s.parentName ?? "padre/madre o tutor"}:`,
        ``,
        opts.update ? `La reunión del IEP de ${name} tiene una nueva fecha.` : `Le invitamos a la ${MEETING_TYPE_ES[m.type]} de ${name}.`,
        ``,
        `Propósito: ${PURPOSE[m.type].es}.`,
        `Fecha y hora: ${slotText("es", slot)}`,
        `Lugar: ${m.location}`,
        ``,
        `Participantes (por cargo):`,
        team,
        ``,
        `Sus derechos:`,
        `  • Puede invitar a otras personas que conozcan a su hijo(a) o tengan conocimientos especiales.`,
        `  • Puede grabar la reunión en audio si nos avisa al menos 24 horas antes (Código de Educación de California § 56341.1(g)).`,
        `  • Si esta hora no le funciona, comuníquese con nosotros y buscaremos otra.`,
        `  • Puede pedir una copia de sus garantías procesales (derechos de los padres) en cualquier momento.`,
        !isEnglish(m.parentLanguage) ? `  • Habrá un intérprete de español sin costo para usted.` : "",
        ``,
        `Atentamente,`,
        c.name,
        c.district,
        c.email + (c.phone ? ` · ${c.phone}` : ""),
      ].join("\n").replace(/\n{3,}/g, "\n\n"),
    };
  }
  return {
    language: needsTranslation ? m.parentLanguage : "en",
    needsTranslation,
    subject: `${opts.update ? "Updated: " : ""}IEP meeting notice for ${name}: ${fmt(slot.date)}`,
    body: [
      `Dear ${s.parentName ?? "Parent/Guardian"},`,
      ``,
      opts.update ? `${name}'s IEP meeting has a new time.` : `You are invited to ${name}'s ${MEETING_TYPE_LABELS[m.type]} meeting.`,
      ``,
      `Purpose: to ${PURPOSE[m.type].en}.`,
      `Date and time: ${slotText("en", slot)}`,
      `Location: ${m.location}`,
      ``,
      `Who will attend (by title):`,
      team,
      ``,
      `Your rights:`,
      `  • You may bring other people who know your child or have special expertise.`,
      `  • You may audio-record the meeting if you tell us at least 24 hours before (Cal. Educ. Code § 56341.1(g)).`,
      `  • If this time doesn't work, contact us and we'll find another.`,
      `  • You can ask for a copy of your procedural safeguards (parent rights) at any time.`,
      !isEnglish(m.parentLanguage) ? `  • A ${m.parentLanguage} interpreter will be provided at no cost to you.` : "",
      ``,
      `Sincerely,`,
      c.name,
      c.district,
      c.email + (c.phone ? ` · ${c.phone}` : ""),
    ].join("\n").replace(/\n{3,}/g, "\n\n"),
  };
}

/** Required-content check: approval is blocked until every item passes. */
export function checkNotice(m: Meeting, s: Student, body: string, language: string, legalDeadline: ISODate): NoticeCheck[] {
  const lang = templateLanguage(m.parentLanguage);
  const has = (re: RegExp) => re.test(body);
  const checks: NoticeCheck[] = [
    { id: "purpose", label: "States the purpose", ok: has(/Purpose:|Propósito:/) },
    { id: "when", label: "Date and time", ok: !!m.chosen && has(/Date and time:|Fecha y hora:/) },
    { id: "where", label: "Location", ok: !!m.location.trim() && has(/Location:|Lugar:/) },
    { id: "who", label: "Who will attend, by title", ok: m.attendees.filter((a) => a.role !== "parent").length >= 3 },
    { id: "bring", label: "Right to bring others", ok: has(/bring other people|invitar a otras personas/) },
    { id: "record", label: "Right to audio-record (24 hours' notice)", ok: has(/24 hours|24 horas/) },
    { id: "contact", label: "How to reach the coordinator", ok: has(/@/) },
    {
      id: "language",
      label: `In the parent's language (${m.parentLanguage || "English"})`,
      ok: lang !== null ? (lang === "en" ? language === "en" : language === lang) : language.toLowerCase() === (m.parentLanguage || "").toLowerCase(),
      detail: lang === null ? "No built-in template for this language: translate it (AI helper or district translator) before approval." : undefined,
    },
    {
      id: "interpreter",
      label: "Interpreter on the team",
      ok: isEnglish(m.parentLanguage) || m.attendees.some((a) => a.role === "interpreter" && !!a.email),
      detail: isEnglish(m.parentLanguage) ? "Not needed" : undefined,
    },
    { id: "deadline", label: "Meeting is before the legal deadline", ok: !!m.chosen && m.chosen.date <= legalDeadline },
    { id: "parent-email", label: "Parent email on file", ok: !!s.parentEmail },
  ];
  return checks;
}
