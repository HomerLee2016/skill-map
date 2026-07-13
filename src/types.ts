export interface RoadmapNode {
  id: string;
  label: string;
  description?: string;
  x?: number;
  y?: number;
  children?: RoadmapNode[];
}