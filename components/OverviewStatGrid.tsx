import Link from "next/link";
import {
  ArrowUpRight, BookOpen, UserCheck, Layers, Users, Map, Target, Inbox, Scale, ClipboardCheck,
  ListChecks, CalendarCheck, PenLine, Building2, UserCog, Network, MailQuestion, GraduationCap, type LucideIcon,
} from "lucide-react";
import { ACCENTS } from "../lib/accents";

export type StatIcon =
  | "courses" | "subjectExpert" | "batches" | "students" | "map" | "plo" | "review" | "weights" | "cqi"
  | "clo" | "semester" | "marks" | "institution" | "coordinators" | "assign" | "requests" | "graduation";

export type Stat = { label: string; value: number; href?: string; tone?: "warn" | "ok" | "neutral"; icon?: StatIcon };

const ICONS: Record<StatIcon, LucideIcon> = {
  courses: BookOpen, subjectExpert: UserCheck, batches: Layers, students: Users, map: Map, plo: Target,
  review: Inbox, weights: Scale, cqi: ClipboardCheck, clo: ListChecks, semester: CalendarCheck, marks: PenLine,
  institution: Building2, coordinators: UserCog, assign: Network, requests: MailQuestion, graduation: GraduationCap,
};

const TONE_LABEL = { warn: "Needs attention", ok: "All clear", neutral: "" } as const;

/** Stat cards — every card on the page gets its own accent colour; the
 * status ("Needs attention" / "All clear") is carried by the pill instead. */
export default function OverviewStatGrid({ stats }: { stats: Stat[] }) {
  return (
    <div className="stat-grid">
      {stats.map((s, i) => {
        const accent = ACCENTS[i % ACCENTS.length];
        const Icon = ICONS[s.icon || "courses"];
        const tone = s.tone || "neutral";
        const style = { "--c": accent.c, "--t": accent.t } as React.CSSProperties;
        const body = (
          <>
            <div className="stat-top">
              <span className="stat-icon"><Icon size={22} strokeWidth={2.1} /></span>
              {tone !== "neutral" && <span className={`tone tone-${tone}`}>{TONE_LABEL[tone]}</span>}
            </div>
            <div className="stat-value">{s.value.toLocaleString()}</div>
            <div className="stat-label">{s.label}</div>
            {s.href && (
              <div className="stat-foot">
                <span className="stat-go">Open <ArrowUpRight size={14} /></span>
              </div>
            )}
          </>
        );
        return s.href ? (
          <Link key={s.label} href={s.href} className="stat" style={style}>{body}</Link>
        ) : (
          <div key={s.label} className="stat" style={style}>{body}</div>
        );
      })}
    </div>
  );
}
