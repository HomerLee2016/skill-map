import express from 'express';
import cors from 'cors';
import { insertCompletedQuestion } from './db';

const app = express();
const PORT = process.env.PORT || 5174;

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

app.listen(PORT, () => {
  console.log(`API server listening on http://localhost:${PORT}`);
});
