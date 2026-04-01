import { Module, forwardRef } from '@nestjs/common';
import { KafkaProducerService } from './kafka.producer';
import { KafkaConsumerService } from './kafka.consumer';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [forwardRef(() => FilesModule)],
  providers: [KafkaProducerService, KafkaConsumerService],
  exports: [KafkaProducerService],
})
export class KafkaModule {}
