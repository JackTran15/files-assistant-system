import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { ChatRole } from '@files-assistant/core';
import { ConversationEntity } from './conversation.entity';

@Entity('messages')
export class MessageEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  conversationId: string;

  @ManyToOne(() => ConversationEntity, (conv) => conv.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversationId' })
  conversation: ConversationEntity;

  @Column({ type: 'enum', enum: ChatRole })
  role: ChatRole;

  @Column('text')
  content: string;

  @Column({ type: 'jsonb', nullable: true })
  sources: Record<string, unknown>[] | null;

  @Column({ type: 'float', nullable: true })
  confidenceScore: number | null;

  @CreateDateColumn()
  createdAt: Date;
}
