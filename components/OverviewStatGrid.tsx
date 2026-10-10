import Link from "next/link";
import {
  ArrowUpRight, BookOpen, UserCheck, Layers, Users, Map, Target, Inbox, Scale, ClipboardCheck,
  ListChecks, CalendarCheck, PenLine, Building2, UserCog, Network, MailQuestion, type LucideIcon,
} from "lucide-react";

export type StatIcon =
  | "courses" | "subjectExpert" | "batches" | "students" | "map" | "plo" | "review" | "weights" | "cqi"
  | "clo" | "semester" | "marks" | "institution" | "coordinators" | "assign" | "requests";

export type Stat = { label: string; value: number; href?: string; tone?: "warn" | "ok" | "neutral"; icon?: StatIcon };

const ICONS: Record<StatIcon, LucideIcon> = {
  courses: BookOpen, subjectExpert: UserCheck, batches: Layers, students: Users, map: Map, plo: Target,
  review: Inbox, weights: Scale, cqi: ClipboardCheck, clo: ListChecks, semester: CalendarCheck, marks: PenLine,
  institution: Building2, coordinators: UserCog, assign: Network, requests: MailQuestion,
};

const TONE_LABEL = { warn: "Needs attention", ok: "All clear", neutral: "" } as const;

/** The overview numbers. Each card is coloured by its tone, with the same three
 * colours these cards always used: amber = needs attention, sage = all clear, neutral = just a count. */
export default function OverviewStatGrid({ stats }: { stats: Stat[] }) {
  if (stats.length === 0) return null;
  return (
    <div className="stat-grid">
      {stats.map((s) => {
        const Icon = ICONS[s.icon || "courses"];
        const tone = s.tone || "neutral";
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
          <Link key={s.label} href={s.href} className={`stat stat-${tone}`}>{body}</Link>
        ) : (
          <div key={s.label} className={`stat stat-${tone}`}>{body}</div>
        );
      })}
    </div>
  );
}
