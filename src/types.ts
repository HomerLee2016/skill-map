export interface RoadmapNode {
  id: string;
  label: string;
  description?: string;
  children?: RoadmapNode[];
}