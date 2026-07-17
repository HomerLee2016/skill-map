export interface RoadmapNode {
  id: string;
  label: string;
  description?: string;
  x?: number;
  y?: number;
  dependsOn?: string[];
  children?: RoadmapNode[];
}

export interface ExtendedRoadmapNode extends RoadmapNode {
  finished?: boolean;
  url?: string;
  lessons?: string[];
  tests?: string[];
  subTreeId?: string;
  children?: ExtendedRoadmapNode[];
}

export interface TestQuestionResult {
  question_number: number;
  question: string;
  selected_answer: string;
  correct_answer: string;
  correct: boolean;
}

export interface TestResultPayload {
  testId: string;
  quiz_title: string;
  timestamp: string;
  questions: TestQuestionResult[];
  score: number;
  total: number;
}

export interface SavedRoadmap {
  id: string;
  name: string;
  yaml: string;
}

export type PageId = 'roadmap' | 'lessons' | 'tests';
