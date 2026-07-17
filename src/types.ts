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
  quizUrl?: string;
  subTreeId?: string;
  children?: ExtendedRoadmapNode[];
}

export interface SavedRoadmap {
  id: string;
  name: string;
  yaml: string;
}

export type PageId = 'roadmap' | 'lessons' | 'tests';
