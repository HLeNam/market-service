import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  Index,
  CreateDateColumn,
} from 'typeorm';

@Entity('candles')
@Index(['symbol', 'interval', 'time'], { unique: true })
@Index(['symbol', 'time'])
export class CandleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20 })
  symbol: string;

  @Column({ type: 'varchar', length: 10 })
  interval: string;

  @Column({ type: 'timestamp' })
  time: Date;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  open: number;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  high: number;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  low: number;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  close: number;

  @Column({ type: 'decimal', precision: 20, scale: 8, nullable: true })
  volume: number;

  @CreateDateColumn()
  createdAt: Date;
}

// DTO for API responses
export class CandleDto {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  isFinal?: boolean;
}
