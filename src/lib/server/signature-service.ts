import { verifyMessage } from 'viem';

export class ProgrammableSecretsSignatureService {
  async verifyEip191Signature(params: {
    address: `0x${string}`;
    message: string;
    signature: `0x${string}`;
  }): Promise<boolean> {
    return verifyMessage({
      address: params.address,
      message: params.message,
      signature: params.signature,
    });
  }
}
