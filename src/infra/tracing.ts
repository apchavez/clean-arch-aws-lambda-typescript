import AWSXRay from 'aws-xray-sdk-core';

export function captureAWSClient<T>(client: T): T {
  return AWSXRay.captureAWSv3Client(client as any) as T;
}
