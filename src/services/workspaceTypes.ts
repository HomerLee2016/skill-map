import type { SavedRoadmap } from '../types';
import type { StructureTree } from '../utils/folderStructure';

export interface LessonItem {
  id: string;
  title: string;
  content: string;
  /** Cloud row version this device last saw (server `updated_at`); lets a save notice that another device changed the item. */
  updatedAt?: string;
}

export interface TestQuestion {
  question_number: number;
  question: string;
  options: string[];
  correct_answer: string;
  explanation?: string;
  /** Text-to-speech url, played through the audio proxy. */
  audio_track_url?: string;
}

export interface TestItem {
  id: string;
  title: string;
  questions: TestQuestion[];
  updatedAt?: string;
}

export interface TestsStructure {
  revision: StructureTree;
  new_tests: StructureTree;
}

export interface WorkspaceContent {
  lessons: LessonItem[];
  tests: TestItem[];
  roadmaps: SavedRoadmap[];
  lessonStructure: StructureTree;
  testsStructure: TestsStructure;
  /** The workspace's AI prompt guide (markdown), when one was saved; otherwise the bundled guide for its language is used. */
  guide?: string;
}

export type { SavedRoadmap };
