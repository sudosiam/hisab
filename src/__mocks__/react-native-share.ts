export enum Social {
  Whatsapp = 'whatsapp',
}

const Share = {
  Social: { WHATSAPP: 'whatsapp', Whatsapp: 'whatsapp' },
  shareSingle: async () => ({ success: true }),
  open: async () => ({ success: true }),
};

export default Share;
