import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { FileStatus, FileType } from '@files-assistant/core';
import { ChunkEntity } from './chunk.entity';

@Entity('files')
export class FileEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  mimeType: string;

  @Column({ type: 'enum', enum: FileType })
  fileType: FileType;

  @Column({ type: 'bigint' })
  size: number;

  @Column({ type: 'enum', enum: FileStatus, default: FileStatus.PENDING })
  status: FileStatus;

  @Column()
  storagePath: string;

  @Column()
  tenantId: string;

  @Column({ default: 0 })
  chunkCount: number;

  @OneToMany(() => ChunkEntity, (chunk) => chunk.file)
  chunks: ChunkEntity[];

  @Column({ nullable: true })
  errorMessage?: string;

  @Column({ nullable: true })
  errorStage?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
