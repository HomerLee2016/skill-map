import express from 'express';
import cors from 'cors';
import { db, completed_questions, insertCompletedQuestion } from './db';

const app = express();
const PORT = process.env.PORT || 5178;

app.use(cors());
app.use(express.json());

app.post('/api/save-question-result', async (req, res) => {
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
    });
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Error saving question result:', err);
    res.status(500).json({ ok: false, error: (err as Error).message ?? 'Internal Server Error' });
  }
});

app.get('/api/completed-questions', (req, res) => {
  try {
    const rows = db.select().from(completed_questions).all();
    res.json({ ok: true, data: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to fetch completed questions' });
  }
});

app.listen(PORT, () => {
  console.log(`API server listening on http://localhost:${PORT}`);
});
