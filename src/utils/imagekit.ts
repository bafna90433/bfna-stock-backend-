import ImageKit from 'imagekit';

const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY as string,
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY as string,
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT as string,
});

export const uploadToImageKit = async (
  fileBuffer: Buffer,
  fileName: string,
  folder: string = '/stock-management'
): Promise<{ url: string; fileId: string }> => {
  const response = await imagekit.upload({
    file: fileBuffer,
    fileName,
    folder,
    useUniqueFileName: true,
  });
  return { url: response.url, fileId: response.fileId };
};

export const deleteFromImageKit = async (fileId: string) => {
  if (!fileId) return;
  try {
    await imagekit.deleteFile(fileId);
  } catch (err) {
    console.error('ImageKit delete error:', err);
  }
};

export default imagekit;
