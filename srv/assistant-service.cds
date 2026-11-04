/**
 * Chat with the approval assistant. Read tools run immediately.
 * Approve and reject are only proposed here; confirm runs the CAP action.
 */
@(requires: 'authenticated-user')
@path: 'assistant'
service AssistantService {
  action chat(message: String(4000), history: LargeString) returns AssistantMessage;
  action confirm(token: String(80)) returns AssistantMessage;
}

type AssistantMessage {
  reply                  : LargeString;
  confirmationRequired   : Boolean;
  confirmToken           : String(80);
  proposedAction         : String(20);
  requestNo              : String(12);
  /** `mock` locally, or the Generative AI Hub model name when AI Core is bound. */
  model                  : String(80);
}
