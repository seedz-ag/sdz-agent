import AWS from 'aws-sdk';

var credentials = new AWS.SharedIniFileCredentials({profile: 'seedz-integration'});
AWS.config.credentials = credentials;

const S3 = new AWS.S3();

export const ls = async (path: string): Promise<AWS.S3.ListObjectsOutput> => {
  const [bucket, ...prefix] = path.split("/");
  return S3.listObjects({
    Bucket: bucket,
    Prefix: prefix.join("/"),
  }).promise()
}

export const readFile = (path: string) => {
  const [bucket, ...prefix] = path.split("/");
  return S3.getObject({
      Bucket: bucket,
      Key: prefix.join("/"),
  }).promise();
}

export const rename = async (Bucket: string, Path: string) => {
  const Key = Path.split("/");
  const Filename = Key.pop();
  return S3.copyObject({
    Bucket: Bucket, 
    CopySource: encodeURI(`${Bucket}/${Key.join("/")}/${Filename}`), 
    Key: encodeURI(`${Key.join("/")}/processed/*${Filename}`)
  })
  .promise()
  .then(() => 
    // Delete the old object
    S3.deleteObject({
      Bucket: Bucket, 
      Key: `${Key.join("/")}/${Filename}`,
    }).promise()
  )
  // Error handling is left up to reader
  .catch((e) => console.error(e))
}

