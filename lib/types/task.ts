export type Task = {
  id: string;
  title: string;
  due?: string;
  important: boolean;
  completed: boolean;
  eventId?: string;
  demo?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateTaskInput = {
  title: string;
  due?: string;
  important?: boolean;
  completed?: boolean;
  eventId?: string;
};
