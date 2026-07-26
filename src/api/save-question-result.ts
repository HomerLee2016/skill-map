import type { NextApiRequest, NextApiResponse } from 'next';
import { insertCompletedQuestion } from '../db';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }
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
  } catch (error) {
    console.error('Failed to save question result', error);
    res.status(500).json({ ok: false, error: (error as Error).message ?? 'Internal Server Error' });
  }
}
