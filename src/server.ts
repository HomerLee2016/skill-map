import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { db, completed_questions, getDueRevisionQuestions, insertCompletedQuestion } from './db';

// Local type shims for the current environment
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const expressAny = express as any;

const app = expressAny();
const PORT = process.env.PORT || 5178;

app.use(cors());
app.use(express.json());

app.post('/api/save-question-result', async (req: Request, res: Response) => {
  try {
    const {
      question_name,
      options,
      correct_answer,
      selected_answer,
      correct,
      last_time,
      proficiency,
      quiz_title,
      question_id,
    } = req.body;
    await insertCompletedQuestion({
      question_name,
      options,
      correct_answer,
      selected_answer,
      correct,
      last_time,
      proficiency,
      quiz_title,
      question_id,
    });
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Error saving question result:', err);
    res.status(500).json({ ok: false, error: (err as Error).message ?? 'Internal Server Error' });
  }
});

app.get('/api/completed-questions', (_req: Request, res: Response) => {
  try {
    const rows = db.select().from(completed_questions).all();
    res.json({ ok: true, data: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to fetch completed questions' });
  }
});

app.get('/api/due-revision-questions', async (_req: Request, res: Response) => {
  try {
    const rows = await getDueRevisionQuestions();
    res.json({ ok: true, data: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to fetch due revision questions' });
  }
});

app.listen(PORT, () => {
  console.log(`API server listening on http://localhost:${PORT}`);
});
