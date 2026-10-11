import type { SavedRoadmap } from '../types';
import type { StructureTree } from '../utils/folderStructure';

export interface LessonItem {
  id: string;
  title: string;
  content: string;
}

export interface TestQuestion {
  question_number: number;
  question: string;
  options: string[];
  correct_answer: string;
  explanation?: string;
}

export interface TestItem {
  id: string;
  title: string;
  questions: TestQuestion[];
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
}

export type { SavedRoadmap };
