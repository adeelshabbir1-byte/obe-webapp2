// Help-desk labels with no database access, so the help panel in the browser can use them too.
export const CATEGORIES: [string, string][] = [["BUG", "Something is broken"], ["HOW_TO", "How do I…?"], ["DATA_CORRECTION", "Wrong data to correct"], ["FEATURE", "An idea / feature request"]];
export const PRIORITIES: [string, string][] = [["LOW", "Low"], ["NORMAL", "Normal"], ["HIGH", "High"], ["URGENT", "Urgent — work is stopped"]];
export const DEFAULT_SLA: Record<string, number> = { URGENT: 4, HIGH: 24, NORMAL: 72, LOW: 120 }; // hours to the first answer
export const STATUS_LABEL: Record<string, string> = { OPEN: "Open", IN_PROGRESS: "In progress", WAITING: "Waiting for you", ANSWERED: "Answered", RESOLVED: "Resolved", CLOSED: "Closed" };
