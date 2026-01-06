import mongoose, { Schema, Document } from 'mongoose';

export interface IToken extends Document {
  access_token: string;
  token_type: string;
  expires_in: number;
  expires_at: Date;
  scope?: string;
}

const TokenSchema: Schema = new Schema({
  access_token: { type: String, required: true },
  token_type: { type: String, required: true },
  expires_in: { type: Number, required: true },
  expires_at: { type: Date, required: true },
  scope: { type: String },
}, { timestamps: true });

// Check if model exists before compiling (Next.js hot reload fix)
const Token = mongoose.models.Token || mongoose.model<IToken>('Token', TokenSchema);

export default Token;
