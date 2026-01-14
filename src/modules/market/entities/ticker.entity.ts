import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('tickers')
@Index(['symbol'])
@Index(['symbol', 'createdAt'])
export class TickerEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20, unique: true })
  symbol: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  baseAsset: string;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  lastPrice: number;

  @Column({ type: 'decimal', precision: 10, scale: 4 })
  priceChangePercent: number;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  highPrice: number;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  lowPrice: number;

  @Column({ type: 'decimal', precision: 30, scale: 8 })
  quoteVolume: number;

  @Column({ type: 'decimal', precision: 30, scale: 8, nullable: true })
  baseVolume: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

// DTO for API responses
export class TickerDto {
  symbol: string;
  baseAsset?: string;
  lastPrice: string;
  priceChangePercent: string;
  highPrice: string;
  lowPrice: string;
  quoteVolume: string;
}
