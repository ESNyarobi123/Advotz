export type NotificationChannel = "email" | "sms";

export type NotificationMessage = {
  channel: NotificationChannel;
  to: string;
  subject?: string;
  body: string;
  dedupKey?: string;
};

export interface NotificationProvider {
  readonly name: string;
  send(message: NotificationMessage): Promise<{ delivered: boolean; simulated: boolean }>;
}

/** Explicit fake transport — never claim SMS/email delivery when using this. */
export class FakeNotificationProvider implements NotificationProvider {
  readonly name = "fake";
  readonly sent: NotificationMessage[] = [];

  async send(
    message: NotificationMessage,
  ): Promise<{ delivered: boolean; simulated: boolean }> {
    this.sent.push(message);
    return { delivered: false, simulated: true };
  }
}
