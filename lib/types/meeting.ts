export type ActionItem = {
  id: string;
  meetingId: string;
  title: string;
  assignee?: string;
  due?: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Meeting = {
  id: string;
  eventId: string;
  title: string;
  participantIds: string[];
  agenda: string[];
  preparationNotes: string[];
  unresolvedQuestions: string[];
  actionItems: ActionItem[];
  demo?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type RecordingConsent = {
  participantId: string;
  granted: boolean;
  grantedAt?: string;
};

export type Recording = {
  id: string;
  meetingId: string;
  startedAt?: string;
  endedAt?: string;
  consent: RecordingConsent[];
  status: "not_started" | "recording" | "stopped";
};

export type TranscriptSegment = {
  speaker?: string;
  startMs: number;
  endMs: number;
  text: string;
};

export type Transcript = {
  id: string;
  recordingId: string;
  text: string;
  segments?: TranscriptSegment[];
  createdAt: string;
};

export type Decision = {
  id: string;
  meetingId: string;
  text: string;
  createdAt: string;
};

export type MeetingSummary = {
  id: string;
  meetingId: string;
  summary: string;
  unresolvedQuestions: string[];
  followUp: string;
  createdAt: string;
};
