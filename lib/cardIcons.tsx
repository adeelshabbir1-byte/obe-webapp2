import {
  Microscope, FileSignature, Database, ShieldCheck, ClipboardCheck, Users, UserPlus, GraduationCap, BookOpen, CalendarDays, Clock, BarChart3,
  LineChart, PieChart, Map as MapIcon, Network, Layers, Settings, Upload, FileText, Files, FolderOpen, Library, Building2, Wallet, Receipt, CreditCard,
  Package, Wrench, Utensils, FlaskConical, Award, Medal, MessageSquare, Megaphone, Vote, Briefcase, Handshake, Globe, Scale, Gavel,
  AlertTriangle, ShieldAlert, Search, Eye, Target, TrendingUp, Activity, CheckSquare, ListChecks, ClipboardList, PenLine, Lightbulb, Route,
  GitCompare, Repeat, RefreshCw, Archive, History, Inbox, Bell, Video, School, Landmark, Sparkles, HeartHandshake, UserCheck, UserCog,
  KeyRound, Link2, Brain, BadgeCheck, Stamp, ScrollText, Calculator, Timer, Gauge, Compass, Puzzle, Workflow, Book, BookMarked, BookPlus,
  NotebookPen, Presentation, ScanLine, Banknote, Coins, DoorOpen, Shield, Lock, FileCheck, FileSpreadsheet, FileBarChart, Table2, Grid3x3,
  GitMerge, GitBranch, ArrowLeftRight, Milestone, Flag, Trophy, Heart, Smile, HelpCircle, Server, Cloud, Plug, Cpu, Bot, Wand2, Copy,
  CalendarCheck, CalendarRange, CalendarClock, UsersRound, Contact, Ribbon, Rocket, Telescope, Waypoints, Signpost, Hourglass, ListTodo,
  ListOrdered, Combine, Split, MessageCircleQuestion, Info, HardDrive, Star, type LucideIcon,
} from "lucide-react";

// A fitting picture per hub card (queue item 10): the first rule that matches the page (by address, then name) gives a
// short list of suitable icons; inside one group each card takes the first icon not used yet, so neighbours differ.
const RULES: [RegExp, LucideIcon[]][] = [
  [/hec-view|national-bank|official-content/, [Landmark, Globe, Library]],
  [/cqi|follow-ups/, [RefreshCw, Repeat, CheckSquare]],
  [/audit-log|assignment-history|historical-grades/, [History, Archive, ScrollText]],
  [/plos|plo-requests|clo-bulk-import/, [Target, Upload, Flag]],
  [/appraisals|instructor-review|weight-exceptions|template-changes/, [ClipboardCheck, Scale, FileCheck, Stamp]],
  [/instructor\/courses|subjectexpert\/courses|course-team|coordinator\/semester|courses-in-degree|elective-options|repeat-offering|college\/design/, [BookOpen, BookPlus, UsersRound, Layers, ListOrdered, Repeat, Copy]],
  [/batches|grading-scale|stakeholders|hod\/department|resources|quality-office|who-does-what/, [Users, Table2, Handshake, Building2, Package, ShieldCheck, Network]],
  [/admin\/(team|users|account-requests|master-experts|demo|ai-usage)/, [UserCog, Users, Inbox, Contact, Rocket, Bot]],
  [/approv|vetting|review-queue|omc\/queue/, [UserCheck, BadgeCheck, CheckSquare, Stamp]],
  [/rollover/, [Repeat, RefreshCw]],
  [/what-?if|prediction|forecast/, [GitBranch, Compass, Telescope]],
  [/plan-generate|generate/, [Wand2, Sparkles]],
  [/question-bank|learn\/questions/, [MessageCircleQuestion, HelpCircle, ListOrdered]],
  [/observation/, [Eye, Presentation]],
  [/timetable|scheduling/, [CalendarClock, CalendarRange, Timer]],
  [/calendar|deadline/, [CalendarDays, CalendarCheck, Hourglass]],
  [/allocation|preferences|availability|course-leads|load-report|workload/, [Layers, Combine, Split, Gauge]],
  [/readiness|setup-check|semester-health|data-quality|system-health/, [Gauge, ListChecks, Activity, ShieldCheck]],
  [/accreditation\/aas|outcomes-report|nceac|program-spec|program-profile|sar|qaa|ipe|proforma/, [FileBarChart, FileText, ScrollText, FileCheck]],
  [/accreditation|evidence|course-folders|lab-file|aol/, [BadgeCheck, FolderOpen, Files, Archive]],
  [/sufficiency|cv-review|faculty-report|teacher-performance/, [UsersRound, Contact, Award]],
  [/outcome-flow|plo-progress|ga-coverage|ga-council|peo|indirect|plo-matrix|plo-weights|clo-attainment|total-summary/, [Target, Waypoints, Network, PieChart, TrendingUp]],
  [/survey|feedback|evaluations|alumni-voice|exit/, [MessageSquare, Smile, Megaphone]],
  [/grade-distribution|benchmark|analytics|batch-comparison|section-comparison|adherence|comparison/, [BarChart3, GitCompare, LineChart]],
  [/complex-problems|portfolio/, [Puzzle, Brain]],
  [/risk|early-warning|plagiarism|complaints|inactivity/, [AlertTriangle, ShieldAlert, Search]],
  [/policy|regulation|rules|criteria|weight-policy|passing|who-decides/, [Scale, Gavel, ScrollText]],
  [/hemis|portal|eligibility|signed-documents|official-transcript|degrees/, [Landmark, FileSignature, Stamp, Shield]],
  [/research|internationalisation/, [Microscope, Globe]],
  [/committee|boards|meeting/, [Users, Vote, Handshake, CalendarCheck]],
  [/curriculum|curricula|master-curriculum|course-homes|course-codes|course-catalog|catalog|equivalence|content-sync|import-content|repositioning|course-split/, [BookMarked, Library, BookPlus, GitMerge, Book, Copy]],
  [/prerequisite|topic-overlap|semester-map|section-map|process-map|where-courses/, [MapIcon, Route, Signpost, Workflow]],
  [/exam|controller|moderation|paper|term-archive|results/, [ClipboardCheck, PenLine, ClipboardList, Archive]],
  [/fyp|project/, [Rocket, Milestone, Flag]],
  [/student|admission|counsel|placement|accommod|status-change|plan-requests|out-of-batch|remediation|deficiency|transcript|societ|election|activities|advisor/, [GraduationCap, School, HeartHandshake, Briefcase, Vote, UserPlus, Contact]],
  [/lab|assets|inventory|store|purchasing/, [FlaskConical, Package, Wrench, Receipt]],
  [/library|textbook|books|requisition/, [Library, BookOpen, BookMarked]],
  [/facilit|booking|meals|campus/, [Building2, DoorOpen, Utensils]],
  [/fee|finance|accounts|billing|pay|refund|hr|benefit|invoice/, [Wallet, Receipt, CreditCard, Banknote, Coins]],
  [/people|org-chart|employees|faculty|teacher|onboarding|lab-engineers|subject-experts|recruit|program-moves|move-program|custodian/, [Users, UserCog, UserPlus, UsersRound, Contact]],
  [/training|recognition|certification|learn|fdp|badge/, [Award, Medal, Trophy, Lightbulb]],
  [/leave|delegation|substitut/, [ArrowLeftRight, Clock]],
  [/setup|settings|institute-settings|modules|platform-settings|messaging|lms|teaching-tools|ai-configuration|backups|migrations|data-import|landing/, [Settings, Plug, Cloud, HardDrive, Upload, Server, Bot, KeyRound]],
  [/report|summary|dashboard|overview|operations|insight|pilot|head-dashboard|yearly/, [BarChart3, LineChart, Gauge, Activity, FileBarChart]],
  [/consortium|collab|affiliat|adp|joint|partner/, [Handshake, Link2, Globe, Network]],
  [/plan|planner|my-obe|guide|handbook|home|profile|topic-workspace|my-/, [NotebookPen, Compass, Info, Star, BookOpen]],
];
const SPARE: LucideIcon[] = [Grid3x3, Table2, Layers, Inbox, Bell, Lock, Cpu, Ribbon, Heart, Hourglass, ListTodo, Video, ScanLine, Calculator, History, Search, Eye, Lightbulb, Star];

/** Icons for the cards of one group: chosen per page, no two alike inside the group. */
export function iconsFor(links: { href: string; label: string }[]): Map<string, LucideIcon> {
  const used = new Set<LucideIcon>(); const out = new Map<string, LucideIcon>();
  for (const l of links) {
    const key = `${l.href} ${l.label}`.toLowerCase();
    const rule = RULES.find(([re]) => re.test(key));
    const pick = (rule ? rule[1] : []).find((i) => !used.has(i)) || SPARE.find((i) => !used.has(i)) || FileText;
    used.add(pick); out.set(l.href, pick);
  }
  return out;
}
export const hasRule = (href: string, label: string) => RULES.some(([re]) => re.test(`${href} ${label}`.toLowerCase()));
