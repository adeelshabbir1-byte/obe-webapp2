import { withErrors } from "../../../../lib/apiHandler";
// Blank MCQ bank template (open in Excel, fill, save as CSV, import).
function GET_handler() {
  const csv = "Question,A,B,C,D,Answer,CLO,Difficulty,Bloom,Topic,Explanation\n" +
    '"Which data structure works first-in, first-out?",Stack,Queue,Tree,Graph,B,CLO-1,EASY,C1,Queues,"A queue removes the oldest item first."\n';
  return new Response(csv, { headers: { "Content-Type": "text/csv", "Content-Disposition": 'attachment; filename="mcq-bank-template.csv"' } });
}
export const GET = withErrors(GET_handler);
