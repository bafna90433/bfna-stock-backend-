import Notification from '../models/Notification';

interface NotifyOptions {
  targetRoles: string[];
  type: 'success' | 'warning' | 'error' | 'info';
  urgent?: boolean;
  title: string;
  message: string;
  link?: string;
  orderId?: string;
}

export const notify = async (opts: NotifyOptions) => {
  try {
    await Notification.create({
      targetRoles: opts.targetRoles,
      type: opts.type,
      urgent: opts.urgent ?? false,
      title: opts.title,
      message: opts.message,
      link: opts.link,
      orderId: opts.orderId,
      readBy: [],
    });
  } catch (e) {
    console.error('Notification create failed:', e);
  }
};
